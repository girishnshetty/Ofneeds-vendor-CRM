import express from "express";
import { migrateSecurity, vault, audit } from "./security.mjs";
import { deliveryService } from "./delivery.mjs";
import { installAccounts } from "./accounts.mjs";
import { installOperations } from "./operations.mjs";
import { installServices } from "./services.mjs";
import { createBackup } from "./backups.mjs";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore, transaction, log } from "./store.mjs";
import {
  kinds,
  emptyData,
  validateRecord,
  validateLinks,
  metrics,
} from "../shared/core.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production =
  process.argv.includes("--production") ||
  process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 4310),
  host = process.env.HOST || "127.0.0.1";
const origin = new URL(process.env.APP_URL || `http://${host}:${port}`).origin;
if (production && !origin.startsWith("https://"))
  throw new Error("Set an HTTPS APP_URL for production.");
const db = openStore(
  join(process.env.CRM_DATA_DIR || join(root, ".data"), "crm.sqlite"),
);
const dataDirectory = process.env.CRM_DATA_DIR || join(root, ".data");
migrateSecurity(db);
const secretVault = vault(dataDirectory, production);
secretVault.sign("startup encryption check");
const delivery = deliveryService(db, secretVault);
const app = express();
app.disable("x-powered-by");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const passwordHash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
};
const matches = (password, stored) => {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(key, "hex"),
  );
};
const dummy = passwordHash(randomUUID());
const budgets = new Map();
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  if (production)
    res.set({
      "Strict-Transport-Security": "max-age=31536000",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
  if (req.path.startsWith("/api/")) {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    )
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (!["GET", "HEAD"].includes(req.method) && !req.is("application/json"))
      return res.status(415).json({ error: "Use application/json." });
    const key =
      (req.socket.remoteAddress || "unknown") +
      (req.path.startsWith("/api/auth/") ||
      req.path.startsWith("/api/security/") ||
      req.path === "/api/portal/exchange"
        ? ":auth"
        : ":api");
    const now = Date.now(),
      budget = budgets.get(key);
    if (!budget || now > budget.until)
      budgets.set(key, { count: 1, until: now + 600000 });
    else if (++budget.count > (key.endsWith(":auth") ? 80 : 3000))
      return res
        .status(429)
        .json({ error: "Too many requests. Try again in 10 minutes." });
    if (budgets.size > 5000)
      for (const [k, v] of budgets) if (v.until < now) budgets.delete(k);
  }
  next();
});
app.use(
  express.json({
    limit: "7mb",
    verify: (req, _res, bytes) => {
      if (req.url === "/api/billing/webhook") req.rawBody = Buffer.from(bytes);
    },
  }),
);
function safe(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    workspaceId: user.workspace,
    preferences: JSON.parse(user.preferences),
  };
}
function current(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("ofneeds_crm="))
    ?.slice(12);
  if (!token) return null;
  const user = db
    .prepare(
      "SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?",
    )
    .get(hash(token), Date.now());
  if (user)
    db.prepare(
      "UPDATE session_info SET last_seen=? WHERE token=? AND last_seen<?",
    ).run(
      new Date().toISOString(),
      hash(token),
      new Date(Date.now() - 60000).toISOString(),
    );
  return user;
}
function session(res, user, req) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    user.id,
    Date.now() + 43200000,
  );
  db.prepare(
    "INSERT OR REPLACE INTO session_info(token,agent,created,last_seen) VALUES(?,?,?,?)",
  ).run(
    hash(token),
    String(req?.headers["user-agent"] || "Local session").slice(0, 250),
    new Date().toISOString(),
    new Date().toISOString(),
  );
  res.cookie("ofneeds_crm", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: production,
    maxAge: 43200000,
    path: "/",
  });
}
function allData(workspace) {
  const data = emptyData();
  for (const row of db
    .prepare("SELECT kind,payload FROM records WHERE workspace=?")
    .all(workspace))
    data[row.kind]?.push(JSON.parse(row.payload));
  return data;
}
const wrap = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
const accounts = installAccounts({
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
});
app.get("/api/health", (_req, res) => {
  db.prepare("SELECT 1").get();
  res.json({ status: "ok", application: "OfNeeds Vendor CRM" });
});
app.get("/api/auth/me", (req, res) => {
  const user = current(req);
  res.json({
    user: user ? safe(user) : null,
    workspace: user
      ? db.prepare("SELECT * FROM workspaces WHERE id=?").get(user.workspace)
      : null,
  });
});
app.post(
  "/api/auth/signup",
  wrap((req, res) => {
    const { name, email, password, company } = req.body || {};
    const normalized = String(email || "")
      .trim()
      .toLowerCase();
    if (
      !String(name || "").trim() ||
      !String(company || "").trim() ||
      !/^\S+@\S+\.\S+$/.test(normalized) ||
      String(password || "").length < 12 ||
      String(password).length > 200
    )
      return res.status(400).json({
        error:
          "Enter your name, company, valid email and a password of 12–200 characters.",
      });
    if (db.prepare("SELECT id FROM users WHERE email=?").get(normalized))
      return res
        .status(409)
        .json({ error: "This email is already registered. Sign in instead." });
    const workspace = randomUUID(),
      id = randomUUID();
    transaction(db, () => {
      db.prepare("INSERT INTO workspaces(id,name) VALUES(?,?)").run(
        workspace,
        String(company).slice(0, 160),
      );
      db.prepare(
        "INSERT INTO users(id,workspace,email,name,password,role) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        workspace,
        normalized,
        String(name).slice(0, 100),
        passwordHash(password),
        "owner",
      );
      log(db, workspace, "Workspace created");
    });
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(id);
    session(res, user, req);
    res.status(201).json({ user: safe(user) });
  }),
);
app.post(
  "/api/auth/login",
  wrap((req, res) => {
    const { email, password } = req.body || {};
    if (String(password || "").length > 200)
      return res.status(400).json({ error: "Password is too long." });
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(
      String(email || "")
        .trim()
        .toLowerCase(),
    );
    const ok = matches(String(password || ""), user?.password || dummy);
    if (!user || !ok)
      return res
        .status(401)
        .json({ error: "Email or password does not match." });
    if (accounts.login(req, res, user)) return;
    session(res, user, req);
    audit(db, user, "sign-in", "security", user.id);
    res.json({ user: safe(user) });
  }),
);
app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("ofneeds_crm="))
    ?.slice(12);
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  res.clearCookie("ofneeds_crm", { path: "/" });
  res.json({ ok: true });
});
app.use("/api/crm", (req, res, next) => {
  const user = current(req);
  if (!user)
    return res.status(401).json({ error: "Sign in to access your workspace." });
  req.user = user;
  if (
    !["GET", "HEAD"].includes(req.method) &&
    user.role === "viewer" &&
    req.path !== "/preferences"
  )
    return res.status(403).json({ error: "Your role has read-only access." });
  next();
});
const ops = installOperations({
  app,
  db,
  current,
  wrap,
  accounts,
  delivery,
  secretVault,
  origin,
  production,
  allData,
});
const services = installServices({
  app,
  db,
  current,
  wrap,
  ops,
  accounts,
  delivery,
  secretVault,
  allData,
  production,
});
app.locals.crmLimits = ops.limits;
app.locals.scanUpload = services.scanUpload;
app.locals.notify = services.notify;
app.get("/api/crm/summary", (req, res) => {
  const data = allData(req.user.workspace);
  res.json({
    metrics: metrics(data),
    overdue: data["follow-ups"].filter(
      (t) =>
        t.status !== "Completed" &&
        t.date < new Date().toISOString().slice(0, 10),
    ).length,
    operational: {
      pending: data.vendors
        .filter(
          (v) => v.status === "Pending" || v.authorization === "Unverified",
        )
        .slice(0, 10),
      expiring: data.vendors
        .filter(
          (v) =>
            v.authorization === "Authorized" &&
            v.authorizationUntil &&
            Date.parse(v.authorizationUntil) >= Date.now() &&
            Date.parse(v.authorizationUntil) < Date.now() + 30 * 86400000,
        )
        .slice(0, 10),
      awaiting: data.rfqs
        .filter(
          (r) =>
            r.status !== "Closed" &&
            (r.responses || []).length < (r.vendorIds || []).length,
        )
        .slice(0, 10),
    },
    activity: db
      .prepare(
        "SELECT id,text,created FROM activity WHERE workspace=? ORDER BY created DESC LIMIT 30",
      )
      .all(req.user.workspace),
    charts: {
      categories: data.vendors.map((v) => v.category),
      cities: data.vendors.map((v) => v.city),
      brands: data.vendors.flatMap((v) => v.brandIds || []),
      onboarding: data.vendors.map((v) => v.createdAt?.slice(0, 10)),
      rfqs: data.rfqs.map((v) => v.status),
      followups: data["follow-ups"].map((v) => ({
        date: v.date,
        status: v.status,
      })),
    },
    progress: {
      profile: Boolean(
        JSON.parse(
          db
            .prepare("SELECT profile FROM workspaces WHERE id=?")
            .get(req.user.workspace).profile,
        ).businessType,
      ),
      vendors: !!data.vendors.length,
      brands: !!data.brands.length,
      rfqs: !!data.rfqs.length,
      imported: data.vendors.some((v) => v.imported),
    },
  });
});
app.get("/api/crm/options", (req, res) => {
  const output = {};
  for (const kind of kinds) {
    output[kind] = db
      .prepare(
        "SELECT id,name,payload FROM records WHERE workspace=? AND kind=? ORDER BY name LIMIT 500",
      )
      .all(req.user.workspace, kind)
      .map((r) => {
        const p = JSON.parse(r.payload);
        return {
          id: r.id,
          name: r.name,
          ...(kind === "vendors"
            ? { city: p.city, category: p.category, brandIds: p.brandIds }
            : {}),
          ...(kind === "brands" ? { category: p.category } : {}),
        };
      });
  }
  res.json(output);
});
app.get("/api/crm/search", (req, res) => {
  const q = String(req.query.q || "")
    .toLowerCase()
    .slice(0, 100);
  if (!q) return res.json([]);
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  res.json(
    db
      .prepare(
        "SELECT id,kind,name FROM records WHERE workspace=? AND lower(payload) LIKE ? ESCAPE '\\' ORDER BY name LIMIT 30",
      )
      .all(req.user.workspace, "%" + escaped + "%"),
  );
});
app.get("/api/crm/team", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,name,email,role FROM users WHERE workspace=? ORDER BY name",
      )
      .all(req.user.workspace),
  ),
);
app.post(
  "/api/crm/team",
  wrap((req, res) => {
    if (req.user.role !== "owner")
      return res
        .status(403)
        .json({ error: "Only the workspace owner can manage members." });
    const { name, email, password, role } = req.body || {};
    if (
      !name ||
      !/^\S+@\S+\.\S+$/.test(String(email)) ||
      String(password || "").length < 12 ||
      String(password).length > 200 ||
      !["member", "viewer"].includes(role)
    )
      return res.status(400).json({
        error:
          "Enter a name, valid email, password of 12–200 characters and member/viewer role.",
      });
    if (
      db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(email.trim().toLowerCase())
    )
      return res.status(409).json({ error: "Email already registered." });
    db.prepare(
      "INSERT INTO users(id,workspace,email,name,password,role) VALUES(?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      req.user.workspace,
      email.trim().toLowerCase(),
      String(name).slice(0, 100),
      passwordHash(password),
      role,
    );
    log(db, req.user.workspace, "Team member added");
    res.status(201).json({ ok: true });
  }),
);
app.patch("/api/crm/preferences", (req, res) => {
  const prefs = req.body;
  if (
    !prefs ||
    typeof prefs !== "object" ||
    Array.isArray(prefs) ||
    JSON.stringify(prefs).length > 30000
  )
    return res.status(400).json({ error: "Invalid preferences." });
  db.prepare("UPDATE users SET preferences=? WHERE id=?").run(
    JSON.stringify(prefs),
    req.user.id,
  );
  res.json({ ok: true });
});
app.patch("/api/crm/workspace", (req, res) => {
  if (req.user.role !== "owner")
    return res
      .status(403)
      .json({ error: "Only the workspace owner can update company details." });
  const { name, businessType, categories, locations, onboardingSkipped } =
    req.body || {};
  if (!String(name || "").trim())
    return res.status(400).json({ error: "Enter your company name." });
  const profile = {
    businessType: String(businessType || "").slice(0, 100),
    categories: Array.isArray(categories)
      ? categories.slice(0, 20).map(String)
      : [],
    locations: String(locations || "").slice(0, 300),
    onboardingSkipped: !!onboardingSkipped,
  };
  db.prepare("UPDATE workspaces SET name=?,profile=? WHERE id=?").run(
    String(name).slice(0, 160),
    JSON.stringify(profile),
    req.user.workspace,
  );
  res.json({ ok: true });
});
function insert(kind, raw, user, imported = false) {
  const data = allData(user.workspace),
    value = validateRecord(kind, raw);
  validateLinks(kind, value, data);
  if (
    kind === "vendors" &&
    data.vendors.some(
      (v) =>
        v.name.toLowerCase() === value.name.toLowerCase() ||
        (value.email && v.email?.toLowerCase() === value.email.toLowerCase()),
    )
  ) {
    const e = new Error("A vendor with this name or email already exists.");
    e.status = 409;
    throw e;
  }
  const row = {
    ...value,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...(imported ? { imported: true } : {}),
  };
  db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(
    row.id,
    user.workspace,
    kind,
    row.name,
    JSON.stringify(row),
    row.createdAt,
  );
  log(
    db,
    user.workspace,
    `Added ${kind === "follow-ups" ? "follow-up" : kind.slice(0, -1)}: ${row.name}`,
  );
  audit(db, user, "record created", kind, row.id, null, row);
  return row;
}
app.post(
  "/api/crm/import",
  wrap((req, res) => {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > 500)
      return res
        .status(400)
        .json({ error: "Import between 1 and 500 vendors at a time." });
    const result = transaction(db, () =>
      rows.map((r) => insert("vendors", r, req.user, true)),
    );
    res.status(201).json({ count: result.length });
  }),
);
app.get("/api/crm/:kind", (req, res) => {
  const kind = req.params.kind;
  if (!kinds.includes(kind))
    return res.status(404).json({ error: "Unknown module." });
  const clauses = ["workspace=?", "kind=?"],
    args = [req.user.workspace, kind];
  if (req.query.favoriteIds) {
    const ids = String(req.query.favoriteIds)
      .split(",")
      .filter(Boolean)
      .slice(0, 500);
    if (ids.length) {
      clauses.push(`id IN (${ids.map(() => "?").join(",")})`);
      args.push(...ids);
    } else clauses.push("0");
  }
  for (const key of [
    "city",
    "state",
    "category",
    "type",
    "authorization",
    "status",
    "stock",
    "vendorId",
  ])
    if (req.query[key]) {
      if (key === "vendorId" && kind === "products") {
        clauses.push(
          "EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.quotes')) q WHERE json_extract(q.value,'$.vendorId')=?)",
        );
      } else if (key === "vendorId" && kind === "rfqs") {
        clauses.push(
          "EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.vendorIds')) v WHERE v.value=?)",
        );
      } else clauses.push(`json_extract(payload,'$.${key}')=?`);
      args.push(String(req.query[key]));
    }
  if (req.query.brandId) {
    clauses.push(
      "(json_extract(payload,'$.brandId')=? OR EXISTS (SELECT 1 FROM json_each(json_extract(payload,'$.brandIds')) WHERE value=?))",
    );
    args.push(String(req.query.brandId), String(req.query.brandId));
  }
  if (req.query.q) {
    const pattern =
      "%" +
      String(req.query.q)
        .toLowerCase()
        .replace(/[\\%_]/g, "\\$&") +
      "%";
    clauses.push(
      "(lower(payload) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM records b JOIN json_each(json_extract(records.payload,'$.brandIds')) ids ON b.id=ids.value WHERE b.workspace=records.workspace AND b.kind='brands' AND lower(b.name) LIKE ? ESCAPE '\\'))",
    );
    args.push(pattern, pattern);
  }
  const where = clauses.join(" AND "),
    page = Math.max(1, Math.min(100000, Number(req.query.page) || 1)),
    limit = Math.max(1, Math.min(100, Number(req.query.limit) || 12));
  const sort = ["name", "city", "status", "createdAt", "date"].includes(
    req.query.sort,
  )
    ? req.query.sort
    : "name";
  const order = sort === "name" ? "name" : `json_extract(payload,'$.${sort}')`;
  const total = db
    .prepare(`SELECT count(*) n FROM records WHERE ${where}`)
    .get(...args).n;
  const rows = db
    .prepare(
      `SELECT payload FROM records WHERE ${where} ORDER BY ${order} ${req.query.direction === "desc" ? "DESC" : "ASC"} LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, (page - 1) * limit)
    .map((r) => JSON.parse(r.payload));
  res.json({ rows, total, page, limit });
});
app.get("/api/crm/:kind/:id", (req, res) => {
  const row = db
    .prepare(
      "SELECT payload FROM records WHERE workspace=? AND kind=? AND id=?",
    )
    .get(req.user.workspace, req.params.kind, req.params.id);
  if (!row) return res.status(404).json({ error: "Record not found." });
  res.json(JSON.parse(row.payload));
});
app.post(
  "/api/crm/:kind",
  wrap((req, res) =>
    res
      .status(201)
      .json(transaction(db, () => insert(req.params.kind, req.body, req.user))),
  ),
);
app.patch(
  "/api/crm/:kind/:id",
  wrap((req, res) => {
    const old = db
      .prepare(
        "SELECT payload FROM records WHERE workspace=? AND kind=? AND id=?",
      )
      .get(req.user.workspace, req.params.kind, req.params.id);
    if (!old) return res.status(404).json({ error: "Record not found." });
    const previous = JSON.parse(old.payload),
      value = validateRecord(req.params.kind, { ...previous, ...req.body });
    const data = allData(req.user.workspace);
    validateLinks(req.params.kind, value, data);
    if (
      req.params.kind === "vendors" &&
      data.vendors.some(
        (v) =>
          v.id !== previous.id &&
          (v.name.toLowerCase() === value.name.toLowerCase() ||
            (value.email &&
              v.email?.toLowerCase() === value.email.toLowerCase())),
      )
    )
      return res
        .status(409)
        .json({ error: "A vendor with this name or email already exists." });
    const row = {
      ...previous,
      ...value,
      revision: (previous.revision || 0) + 1,
    };
    db.prepare(
      "UPDATE records SET name=?,payload=? WHERE id=? AND workspace=?",
    ).run(row.name, JSON.stringify(row), row.id, req.user.workspace);
    audit(
      db,
      req.user,
      "record updated",
      req.params.kind,
      row.id,
      previous,
      row,
    );
    log(db, req.user.workspace, `Updated ${row.name}`);
    res.json(row);
  }),
);
app.delete(
  "/api/crm/:kind/:id",
  wrap((req, res) => {
    const { kind, id } = req.params;
    const row = db
      .prepare(
        "SELECT payload FROM records WHERE workspace=? AND kind=? AND id=?",
      )
      .get(req.user.workspace, kind, id);
    if (!row) return res.status(404).json({ error: "Record not found." });
    const data = allData(req.user.workspace);
    if (
      kind === "vendors" &&
      (data.contacts.some((r) => r.vendorId === id) ||
        data["follow-ups"].some((r) => r.vendorId === id) ||
        data.rfqs.some((r) => r.vendorIds?.includes(id)) ||
        data.products.some((r) => r.quotes?.some((q) => q.vendorId === id)) ||
        data.documents.some((r) => r.vendorId === id))
    )
      return res.status(409).json({
        error:
          "This vendor has related records. Archive the vendor to preserve history.",
      });
    if (
      kind === "brands" &&
      (data.vendors.some((r) => r.brandIds?.includes(id)) ||
        data.products.some((r) => r.brandId === id))
    )
      return res.status(409).json({
        error: "Remove the brand from related vendors and products first.",
      });
    if (kind === "products" && data.rfqs.some((r) => r.productId === id))
      return res.status(409).json({
        error:
          "This product is linked to RFQs. Keep it for procurement history.",
      });
    db.prepare("DELETE FROM records WHERE id=? AND workspace=?").run(
      id,
      req.user.workspace,
    );
    audit(
      db,
      req.user,
      "record deleted",
      kind,
      id,
      JSON.parse(row.payload),
      null,
    );
    log(db, req.user.workspace, `Deleted ${JSON.parse(row.payload).name}`);
    res.json({ ok: true });
  }),
);
app.post(
  "/api/crm/documents/:id/file",
  wrap((req, res) => {
    const row = db
      .prepare(
        "SELECT id FROM records WHERE id=? AND workspace=? AND kind='documents'",
      )
      .get(req.params.id, req.user.workspace);
    if (!row) return res.status(404).json({ error: "Document not found." });
    const { base64, mime } = req.body || {};
    const bytes = Buffer.from(String(base64 || ""), "base64");
    if (
      !["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(
        mime,
      ) ||
      !bytes.length ||
      bytes.length > 4000000
    )
      return res
        .status(400)
        .json({ error: "Upload PDF, PNG, JPG or TXT under 4 MB." });
    db.prepare("INSERT OR REPLACE INTO files VALUES(?,?,?,?)").run(
      row.id,
      req.user.workspace,
      bytes,
      mime,
    );
    audit(
      db,
      req.user,
      "document attachment uploaded",
      "documents",
      row.id,
      null,
      { mime, bytes: bytes.length },
    );
    res.json({ ok: true });
  }),
);
app.get("/api/crm/documents/:id/file", (req, res) => {
  const row = db
    .prepare("SELECT content,mime FROM files WHERE record_id=? AND workspace=?")
    .get(req.params.id, req.user.workspace);
  if (!row) return res.status(404).json({ error: "No file uploaded." });
  res
    .set({
      "Content-Type": row.mime,
      "Content-Disposition": 'attachment; filename="ofneeds-document"',
    })
    .send(Buffer.from(row.content));
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
if (production) {
  app.use(
    express.static(join(root, "dist"), { index: false, dotfiles: "deny" }),
  );
  app.get("*", (_req, res) => res.sendFile(join(root, "dist/index.html")));
} else if (!process.argv.includes("--api-test")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((error, _req, res, _next) => {
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "Request is too large." });
  if (error instanceof SyntaxError)
    return res.status(400).json({ error: "Invalid JSON." });
  res
    .status(error.status || 400)
    .json({ error: error.message || "Request failed." });
});
let backupRunning = false;
const backupHours = Math.max(
  0,
  Number(process.env.CRM_BACKUP_INTERVAL_HOURS ?? (production ? 24 : 0)),
);
if (backupHours) {
  const timer = setInterval(
    async () => {
      if (backupRunning) return;
      backupRunning = true;
      try {
        await createBackup(db, dataDirectory, secretVault);
        db.prepare("INSERT OR REPLACE INTO service_state VALUES(?,?)").run(
          "lastBackup",
          new Date().toISOString(),
        );
      } catch {
        console.error(
          "Encrypted backup could not complete. Check the recovery runbook.",
        );
      } finally {
        backupRunning = false;
      }
    },
    Math.max(backupHours, 1) * 3600000,
  );
  timer.unref();
}
const server = app.listen(port, host, () =>
  console.log(`OfNeeds Vendor CRM: http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
