import { randomBytes, randomUUID } from "node:crypto";
import { digest, base32, counterFor, audit } from "./security.mjs";
import { transaction } from "./store.mjs";
export function installAccounts({
  app,
  db,
  current,
  safe,
  session,
  matches,
  passwordHash,
  origin,
  production,
  secretVault,
  delivery,
  wrap,
}) {
  const error = (text, status = 400) => Object.assign(Error(text), { status });
  const authenticated = (req, res, next) => {
    req.user = current(req);
    if (!req.user)
      return res
        .status(401)
        .json({ error: "Sign in to manage account security." });
    next();
  };
  const security = (id) =>
    db.prepare("SELECT * FROM account_security WHERE user_id=?").get(id) || {
      user_id: id,
      last_counter: -1,
      recovery_codes: "[]",
    };
  const ensure = (id) =>
    db
      .prepare("INSERT OR IGNORE INTO account_security(user_id) VALUES(?)")
      .run(id);
  function createToken(type, info, age = 3600000) {
    const raw = randomBytes(32).toString("hex"),
      hash = digest(raw);
    db.prepare(
      "INSERT INTO access_tokens(hash,type,user_id,workspace,vendor_id,email,role,expires,payload) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      hash,
      type,
      info.userId || null,
      info.workspace || null,
      info.vendorId || null,
      info.email || null,
      info.role || null,
      Date.now() + age,
      JSON.stringify(info.payload || {}),
    );
    return raw;
  }
  function validToken(raw, type) {
    const row = db
      .prepare(
        "SELECT * FROM access_tokens WHERE hash=? AND type=? AND used_at IS NULL AND expires>?",
      )
      .get(digest(String(raw || "")), type, Date.now());
    if (!row)
      throw error("This link is invalid or expired. Request a new one.", 410);
    return row;
  }
  const useToken = (row) =>
    db
      .prepare(
        "UPDATE access_tokens SET used_at=? WHERE hash=? AND used_at IS NULL",
      )
      .run(new Date().toISOString(), row.hash);
  function verifyCode(userId, code) {
    const sec = security(userId);
    if (!sec.mfa_secret) return true;
    const normalized = String(code || "")
      .replaceAll("-", "")
      .toUpperCase();
    const codes = JSON.parse(sec.recovery_codes);
    const hash = digest(normalized);
    const found = codes.indexOf(hash);
    if (found >= 0) {
      codes.splice(found, 1);
      db.prepare(
        "UPDATE account_security SET recovery_codes=? WHERE user_id=?",
      ).run(JSON.stringify(codes), userId);
      return true;
    }
    const counter = counterFor(
      secretVault.open(sec.mfa_secret).toString(),
      String(code || ""),
      sec.last_counter,
    );
    if (counter === null) return false;
    db.prepare(
      "UPDATE account_security SET last_counter=? WHERE user_id=?",
    ).run(counter, userId);
    return true;
  }
  function requirePassword(req) {
    const password = String(req.body?.password || "");
    if (password.length > 200 || !matches(password, req.user.password))
      throw error("Confirm your current password.", 401);
  }
  function login(req, res, user) {
    if (!security(user.id).mfa_secret) return false;
    const raw = randomBytes(32).toString("hex");
    db.prepare(
      "INSERT INTO mfa_challenges(hash,user_id,expires) VALUES(?,?,?)",
    ).run(digest(raw), user.id, Date.now() + 300000);
    res.json({ mfaRequired: true, challenge: raw });
    return true;
  }
  app.post(
    "/api/auth/mfa",
    wrap((req, res) => {
      const challenge = db
        .prepare(
          "SELECT * FROM mfa_challenges WHERE hash=? AND expires>? AND attempts<8",
        )
        .get(digest(String(req.body.challenge || "")), Date.now());
      if (!challenge)
        throw error("Sign-in challenge expired. Start again.", 401);
      db.prepare(
        "UPDATE mfa_challenges SET attempts=attempts+1 WHERE hash=?",
      ).run(challenge.hash);
      if (!verifyCode(challenge.user_id, req.body.code))
        throw error(
          "Authenticator or recovery code is invalid or already used.",
          401,
        );
      db.prepare("DELETE FROM mfa_challenges WHERE hash=?").run(challenge.hash);
      const user = db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(challenge.user_id);
      session(res, user, req);
      audit(db, user, "sign-in", "security", user.id, null, { mfa: true });
      res.json({ user: safe(user) });
    }),
  );
  app.post(
    "/api/auth/forgot-password",
    wrap(async (req, res) => {
      const email = String(req.body.email || "")
        .trim()
        .toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email))
        throw error("Enter a valid email address.");
      const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (user) {
        db.prepare(
          "UPDATE access_tokens SET used_at=? WHERE type='reset' AND user_id=? AND used_at IS NULL",
        ).run(new Date().toISOString(), user.id);
        const raw = createToken("reset", {
          userId: user.id,
          workspace: user.workspace,
        });
        const message = delivery.queue({
          workspace: user.workspace,
          to: user.email,
          subject: "Reset your OfNeeds Vendor CRM password",
          body: {
            text: `Open ${origin}/reset-password?token=${raw} within one hour. Resetting your password revokes existing sessions. MFA remains required when enabled.`,
          },
        });
        if (delivery.ready("email"))
          await delivery.send(message.id, user.workspace);
      }
      res.json({
        message:
          "If an account matches this email, a recovery message has been requested. Delivery requires a configured email provider.",
      });
    }),
  );
  app.post(
    "/api/auth/reset-password",
    wrap((req, res) => {
      const token = validToken(req.body.token, "reset");
      if (
        String(req.body.password || "").length < 12 ||
        String(req.body.password).length > 200
      )
        throw error("Use a password of 12–200 characters.");
      transaction(db, () => {
        if (!verifyCode(token.user_id, req.body.code))
          throw error("Enter an authenticator or unused recovery code.", 401);
        db.prepare("UPDATE users SET password=? WHERE id=?").run(
          passwordHash(req.body.password),
          token.user_id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(token.user_id);
        db.prepare("DELETE FROM mfa_challenges WHERE user_id=?").run(
          token.user_id,
        );
        useToken(token);
        audit(
          db,
          { id: token.user_id, workspace: token.workspace },
          "password reset",
          "security",
          token.user_id,
        );
      });
      res.json({
        message: "Password updated. Sign in with your new password.",
      });
    }),
  );
  app.post(
    "/api/auth/verify-email",
    wrap((req, res) => {
      const token = validToken(req.body.token, "verify"),
        payload = JSON.parse(token.payload);
      transaction(db, () => {
        ensure(token.user_id);
        if (payload.realDelivery)
          db.prepare(
            "UPDATE account_security SET verified_at=? WHERE user_id=?",
          ).run(new Date().toISOString(), token.user_id);
        useToken(token);
        audit(
          db,
          { id: token.user_id, workspace: token.workspace },
          payload.realDelivery ? "email verified" : "local email flow tested",
          "security",
          token.user_id,
        );
      });
      res.json({
        message: payload.realDelivery
          ? "Email verified."
          : "Local verification flow completed. Email ownership is not verified without actual delivery.",
        verified: !!payload.realDelivery,
      });
    }),
  );
  app.get(
    "/api/auth/invitation",
    wrap((req, res) => {
      const token = validToken(req.query.token, "invite");
      res.json({
        email: token.email,
        role: token.role,
        workspace: db
          .prepare("SELECT name FROM workspaces WHERE id=?")
          .get(token.workspace)?.name,
      });
    }),
  );
  app.post(
    "/api/auth/accept-invitation",
    wrap((req, res) => {
      const token = validToken(req.body.token, "invite");
      if (
        !String(req.body.name || "").trim() ||
        String(req.body.password || "").length < 12 ||
        String(req.body.password).length > 200
      )
        throw error("Enter your name and a password of 12–200 characters.");
      if (db.prepare("SELECT id FROM users WHERE email=?").get(token.email))
        throw error(
          "This email already has an account. Contact the workspace owner.",
          409,
        );
      if (
        app.locals.crmLimits &&
        db
          .prepare("SELECT count(*) n FROM users WHERE workspace=?")
          .get(token.workspace).n >= app.locals.crmLimits(token.workspace).seats
      )
        throw error("Workspace seat limit reached.", 403);
      const id = randomUUID();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO users(id,workspace,email,name,password,role) VALUES(?,?,?,?,?,?)",
        ).run(
          id,
          token.workspace,
          token.email,
          String(req.body.name).slice(0, 100),
          passwordHash(req.body.password),
          token.role,
        );
        useToken(token);
        audit(
          db,
          { id, workspace: token.workspace },
          "invitation accepted",
          "team",
          id,
          null,
          { role: token.role, email: token.email },
        );
      });
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
      session(res, user, req);
      res.status(201).json({ user: safe(user) });
    }),
  );
  app.use("/api/security", authenticated);
  app.get("/api/security/status", (req, res) => {
    const sec = security(req.user.id);
    res.json({
      emailVerified: !!sec.verified_at,
      verifiedAt: sec.verified_at,
      mfaEnabled: !!sec.mfa_secret,
      recoveryCodesRemaining: JSON.parse(sec.recovery_codes).length,
      emailDeliveryConfigured: delivery.ready("email"),
    });
  });
  app.post(
    "/api/security/verification-request",
    wrap((req, res) => {
      ensure(req.user.id);
      const realDelivery = delivery.ready("email"),
        raw = createToken(
          "verify",
          {
            userId: req.user.id,
            workspace: req.user.workspace,
            payload: { realDelivery },
          },
          86400000,
        ),
        link = `${origin}/verify-email?token=${raw}`;
      const message = delivery.queue({
        workspace: req.user.workspace,
        to: req.user.email,
        subject: "Verify your OfNeeds Vendor CRM email",
        body: { text: `Verify your email: ${link}` },
      });
      res.json({
        ...message,
        ...(!production && !realDelivery ? { localTestLink: link } : {}),
      });
    }),
  );
  app.post(
    "/api/security/mfa/enroll",
    wrap((req, res) => {
      requirePassword(req);
      ensure(req.user.id);
      if (security(req.user.id).mfa_secret)
        throw error("MFA is already enabled.");
      const secret = base32(randomBytes(20));
      db.prepare(
        "UPDATE account_security SET pending_secret=? WHERE user_id=?",
      ).run(
        secretVault.seal(
          JSON.stringify({ secret, expires: Date.now() + 600000 }),
        ),
        req.user.id,
      );
      res.json({
        secret,
        uri: `otpauth://totp/${encodeURIComponent("OfNeeds CRM:" + req.user.email)}?secret=${secret}&issuer=OfNeeds%20CRM&algorithm=SHA1&digits=6&period=30`,
      });
    }),
  );
  app.post(
    "/api/security/mfa/confirm",
    wrap((req, res) => {
      const sec = security(req.user.id);
      if (!sec.pending_secret)
        throw error("Start authenticator enrollment first.");
      const pending = JSON.parse(
        secretVault.open(sec.pending_secret).toString(),
      );
      const counter = counterFor(pending.secret, String(req.body.code || ""));
      if (pending.expires < Date.now() || counter === null)
        throw error("Enter a valid current authenticator code.");
      const codes = Array.from({ length: 10 }, () =>
        randomBytes(8).toString("hex").toUpperCase(),
      );
      transaction(db, () => {
        db.prepare(
          "UPDATE account_security SET mfa_secret=?,pending_secret=NULL,last_counter=?,recovery_codes=? WHERE user_id=?",
        ).run(
          secretVault.seal(pending.secret),
          counter,
          JSON.stringify(codes.map(digest)),
          req.user.id,
        );
        const own = String(req.headers.cookie || "")
          .split(";")
          .map((v) => v.trim())
          .find((v) => v.startsWith("ofneeds_crm="))
          ?.slice(12);
        db.prepare("DELETE FROM sessions WHERE user_id=? AND token!=?").run(
          req.user.id,
          digest(own || ""),
        );
        audit(db, req.user, "MFA enabled", "security", req.user.id);
      });
      res.json({ recoveryCodes: codes });
    }),
  );
  app.post(
    "/api/security/mfa/disable",
    wrap((req, res) => {
      requirePassword(req);
      transaction(db, () => {
        if (!verifyCode(req.user.id, req.body.code))
          throw error(
            "Enter a current authenticator or unused recovery code.",
            401,
          );
        db.prepare(
          "UPDATE account_security SET mfa_secret=NULL,pending_secret=NULL,recovery_codes='[]',last_counter=-1 WHERE user_id=?",
        ).run(req.user.id);
        audit(db, req.user, "MFA disabled", "security", req.user.id);
      });
      res.json({ ok: true });
    }),
  );
  app.get("/api/security/sessions", (req, res) => {
    const raw = (req.headers.cookie || "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("ofneeds_crm="))
        ?.slice(12),
      own = digest(raw || "");
    res.json(
      db
        .prepare(
          "SELECT s.token,s.expires,i.agent,i.created,i.last_seen FROM sessions s LEFT JOIN session_info i ON s.token=i.token WHERE s.user_id=? AND s.expires>? ORDER BY i.created DESC",
        )
        .all(req.user.id, Date.now())
        .map((r) => ({
          id: r.token,
          expires: r.expires,
          agent: r.agent || "Earlier session",
          created: r.created,
          lastSeen: r.last_seen,
          current: r.token === own,
        })),
    );
  });
  app.delete("/api/security/sessions/:id", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE user_id=? AND token=?").run(
      req.user.id,
      req.params.id,
    );
    audit(
      db,
      req.user,
      "session revoked",
      "security",
      req.params.id.slice(0, 8),
    );
    res.json({ ok: true });
  });
  app.post(
    "/api/security/invitations",
    wrap((req, res) => {
      if (req.user.role !== "owner")
        throw error("Only the workspace owner can invite members.", 403);
      requirePassword(req);
      const email = String(req.body.email || "")
          .trim()
          .toLowerCase(),
        role = req.body.role;
      if (!/^\S+@\S+\.\S+$/.test(email) || !["member", "viewer"].includes(role))
        throw error("Choose a valid email and member/viewer role.");
      if (db.prepare("SELECT id FROM users WHERE email=?").get(email))
        throw error("An account already exists for that email.", 409);
      const raw = createToken(
          "invite",
          { email, role, workspace: req.user.workspace },
          72 * 3600000,
        ),
        link = `${origin}/accept-invitation?token=${raw}`;
      const message = delivery.queue({
        workspace: req.user.workspace,
        to: email,
        subject: "Join your OfNeeds Vendor CRM workspace",
        body: {
          text: `You are invited as ${role}. Set up your own password: ${link}\nThis invitation expires in 72 hours.`,
        },
      });
      audit(db, req.user, "member invited", "team", "", null, { email, role });
      res
        .status(201)
        .json({ ...message, invitationLink: link, expiresInHours: 72 });
    }),
  );
  app.get("/api/security/invitations", (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Owner access required." });
    res.json(
      db
        .prepare(
          "SELECT hash id,email,role,expires,used_at FROM access_tokens WHERE workspace=? AND type='invite' ORDER BY expires DESC LIMIT 100",
        )
        .all(req.user.workspace),
    );
  });
  app.delete("/api/security/invitations/:id", (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Owner access required." });
    db.prepare(
      "UPDATE access_tokens SET used_at=? WHERE hash=? AND workspace=? AND type='invite'",
    ).run(new Date().toISOString(), req.params.id, req.user.workspace);
    res.json({ ok: true });
  });
  return {
    login,
    createToken,
    validToken,
    useToken,
    requirePassword,
    verifyCode,
    security,
  };
}
