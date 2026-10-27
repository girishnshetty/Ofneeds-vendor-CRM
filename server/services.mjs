import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { audit, digest } from "./security.mjs";
import { transaction } from "./store.mjs";
import { filterRecords, csv, validateRecord } from "../shared/core.mjs";
export function installServices({
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
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,user_id TEXT,text TEXT NOT NULL,record_kind TEXT,record_id TEXT,created TEXT NOT NULL,read_at TEXT,dedupe TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS webhook_jobs(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,event_id TEXT NOT NULL UNIQUE,encrypted_body TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,error TEXT);
 CREATE TABLE IF NOT EXISTS service_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 `);
  const fail = (message, status = 400) =>
      Object.assign(Error(message), { status }),
    owner = (req) => {
      if (req.user.role !== "owner")
        throw fail("Only the workspace owner can manage this service.", 403);
    };
  const identity = (req, res, next) => {
    req.user = current(req);
    if (!req.user)
      return res.status(401).json({ error: "Sign in to your workspace." });
    next();
  };
  function notify(workspace, userId, text, kind, id, dedupe) {
    db.prepare(
      "INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      randomUUID(),
      workspace,
      userId || null,
      text,
      kind || "",
      id || "",
      new Date().toISOString(),
      null,
      dedupe || randomUUID(),
    );
  }
  function report(workspace, type) {
    const data = allData(workspace);
    return type === "tasks"
      ? csv(data["follow-ups"], [
          "name",
          "vendorId",
          "date",
          "status",
          "priority",
        ])
      : type === "sourcing"
        ? csv(data.rfqs, ["name", "quantity", "status", "deadline"])
        : csv(data.vendors, [
            "name",
            "city",
            "category",
            "authorization",
            "status",
          ]);
  }
  function jobs(workspace) {
    const now = new Date(),
      today = now.toISOString().slice(0, 10),
      records = ops.operations(workspace),
      base = allData(workspace);
    let generated = 0;
    const settings = ops.config(workspace);
    transaction(db, () => {
      for (const rule of records.automations.filter(
        (r) => r.enabled !== false && r.nextDate <= today,
      )) {
        const period = rule.nextDate;
        if (
          db
            .prepare(
              "SELECT 1 FROM automation_runs WHERE workspace=? AND rule_id=? AND period=?",
            )
            .get(workspace, rule.id, period)
        )
          continue;
        const task = {
          id: randomUUID(),
          name: rule.name,
          vendorId: rule.vendorId,
          date: today,
          status: "Open",
          priority: rule.priority || "Normal",
          assigneeId: rule.assigneeId || "",
          automationId: rule.id,
          createdAt: now.toISOString(),
        };
        db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(
          task.id,
          workspace,
          "follow-ups",
          task.name,
          JSON.stringify(task),
          task.createdAt,
        );
        db.prepare("INSERT INTO automation_runs VALUES(?,?,?,?)").run(
          workspace,
          rule.id,
          period,
          now.toISOString(),
        );
        const nextDate = new Date(
          now.getTime() + Number(rule.frequencyDays) * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        ops.put(
          { id: "automation-worker", workspace },
          "automations",
          { ...rule, nextDate },
          rule,
        );
        notify(
          workspace,
          rule.assigneeId,
          `Follow-up scheduled: ${rule.name}`,
          "follow-ups",
          task.id,
          `task:${task.id}`,
        );
        generated++;
      }
      for (const task of base["follow-ups"].filter(
        (t) => t.status !== "Completed" && t.date < today,
      )) {
        const age = Math.floor(
            (Date.parse(today) - Date.parse(task.date)) / 86400000,
          ),
          rule = records.automations.find((r) => r.id === task.automationId),
          threshold = rule?.escalateAfterDays || 3;
        if (age >= threshold)
          notify(
            workspace,
            null,
            `Overdue by ${age} days: ${task.name}`,
            "follow-ups",
            task.id,
            `overdue:${task.id}:${today}`,
          );
      }
      for (const vendor of base.vendors.filter(
        (v) => v.authorization === "Authorized" && v.authorizationUntil,
      )) {
        const days = Math.ceil(
          (Date.parse(vendor.authorizationUntil) - now.getTime()) / 86400000,
        );
        if (days <= 30)
          notify(
            workspace,
            null,
            `${days < 0 ? "Expired" : "Expiring"} authorization: ${vendor.name}`,
            "vendors",
            vendor.id,
            `expiry:${vendor.id}:${today}`,
          );
      }
      for (const schedule of records["report-schedules"].filter(
        (r) => r.enabled !== false && r.nextDate <= today,
      )) {
        if (
          db
            .prepare(
              "SELECT 1 FROM automation_runs WHERE workspace=? AND rule_id=? AND period=?",
            )
            .get(workspace, schedule.id, schedule.nextDate)
        )
          continue;
        const content = report(workspace, schedule.report),
          id = randomUUID();
        db.prepare("INSERT INTO report_snapshots VALUES(?,?,?,?,?)").run(
          id,
          workspace,
          schedule.name,
          content,
          now.toISOString(),
        );
        delivery.queue({
          workspace,
          to: schedule.recipient,
          subject: `OfNeeds report: ${schedule.name}`,
          body: {
            text: "Your saved report is attached.",
            attachments: [
              {
                name: "ofneeds-report.csv",
                type: "text/csv",
                base64: Buffer.from(content).toString("base64"),
              },
            ],
          },
          dedupe: `report:${schedule.id}:${schedule.nextDate}`,
        });
        db.prepare("INSERT INTO automation_runs VALUES(?,?,?,?)").run(
          workspace,
          schedule.id,
          schedule.nextDate,
          now.toISOString(),
        );
        ops.put(
          { id: "automation-worker", workspace },
          "report-schedules",
          {
            ...schedule,
            nextDate: new Date(
              now.getTime() + Number(schedule.frequencyDays) * 86400000,
            )
              .toISOString()
              .slice(0, 10),
          },
          schedule,
        );
        generated++;
      }
      if (settings.webhook) {
        const events = db
          .prepare(
            "SELECT * FROM audit_events WHERE workspace=? ORDER BY seq DESC LIMIT 100",
          )
          .all(workspace);
        for (const event of events) {
          const body = {
            id: event.id,
            type: event.action,
            kind: event.kind,
            recordId: event.record_id,
            created: event.created,
          };
          db.prepare(
            "INSERT OR IGNORE INTO webhook_jobs(id,workspace,event_id,encrypted_body,status,created) VALUES(?,?,?,?,?,?)",
          ).run(
            randomUUID(),
            workspace,
            event.id,
            secretVault.seal(JSON.stringify(body)),
            "queued",
            now.toISOString(),
          );
        }
      }
    });
    return {
      generated,
      notice:
        "Local tasks, notifications and snapshots processed. No external messages were dispatched.",
    };
  }
  app.use("/api/services", identity);
  app.get("/api/services/status", (req, res) => {
    const quota = ops.limits(req.user.workspace),
      storage = db
        .prepare(
          "SELECT COALESCE(sum(length(content)),0) n FROM files WHERE workspace=?",
        )
        .get(req.user.workspace).n;
    res.json({
      email: delivery.ready("email"),
      whatsapp: delivery.ready("whatsapp"),
      scanner: !!(
        process.env.CRM_SCAN_GATEWAY_URL && process.env.CRM_SCAN_GATEWAY_TOKEN
      ),
      webhooks: !!ops.config(req.user.workspace).webhook,
      billingWebhook: !!process.env.CRM_BILLING_WEBHOOK_SECRET,
      storageBytes: storage,
      quota,
      lastBackup:
        db
          .prepare("SELECT value FROM service_state WHERE key='lastBackup'")
          .get()?.value || null,
      backupIntervalHours: Number(
        process.env.CRM_BACKUP_INTERVAL_HOURS ?? (production ? 24 : 0),
      ),
      scope:
        "Single-server SQLite; external connections require configured providers.",
    });
  });
  app.get("/api/services/notifications", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM notifications WHERE workspace=? AND (user_id IS NULL OR user_id=?) ORDER BY created DESC LIMIT 50",
        )
        .all(req.user.workspace, req.user.id),
    ),
  );
  app.post("/api/services/notifications/read", (req, res) => {
    db.prepare(
      "UPDATE notifications SET read_at=? WHERE workspace=? AND (user_id IS NULL OR user_id=?) AND id=?",
    ).run(
      new Date().toISOString(),
      req.user.workspace,
      req.user.id,
      req.body.id,
    );
    res.json({ ok: true });
  });
  app.post(
    "/api/services/process-jobs",
    wrap((req, res) => {
      owner(req);
      res.json(jobs(req.user.workspace));
    }),
  );
  app.get("/api/services/report-snapshots", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT id,name,created FROM report_snapshots WHERE workspace=? ORDER BY created DESC LIMIT 100",
        )
        .all(req.user.workspace),
    ),
  );
  app.get(
    "/api/services/report-snapshots/:id",
    wrap((req, res) => {
      const row = db
        .prepare(
          "SELECT content FROM report_snapshots WHERE workspace=? AND id=?",
        )
        .get(req.user.workspace, req.params.id);
      if (!row) throw fail("Report not found.", 404);
      res
        .set({
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": 'attachment; filename="ofneeds-report.csv"',
        })
        .send(row.content);
    }),
  );
  app.get(
    "/api/services/export/:kind",
    wrap((req, res) => {
      const data = allData(req.user.workspace),
        kind = req.params.kind;
      if (!data[kind]) throw fail("Unknown export module.", 404);
      let rows = filterRecords(data[kind], req.query);
      if (rows.length > 25000)
        throw fail("Export exceeds 25,000 rows; narrow the filters.");
      rows = rows.map((r) => ({
        ...r,
        brands: r.brandIds
          ?.map((id) => data.brands.find((b) => b.id === id)?.name)
          .join("; "),
      }));
      const columns =
        kind === "vendors"
          ? [
              "name",
              "contact",
              "email",
              "phone",
              "city",
              "state",
              "category",
              "brands",
              "authorization",
              "status",
            ]
          : kind === "rfqs"
            ? ["name", "quantity", "status", "deadline"]
            : kind === "contacts"
              ? ["name", "email", "phone", "role", "vendorId"]
              : ["name", "category", "description", "status"];
      res
        .set({
          "Content-Type": "text/csv;charset=utf-8",
          "Content-Disposition": `attachment; filename="ofneeds-${kind}.csv"`,
        })
        .send(csv(rows, columns));
    }),
  );
  app.get(
    "/api/services/lookup/:kind",
    wrap((req, res) => {
      const kind = req.params.kind;
      if (
        ![
          "vendors",
          "brands",
          "products",
          "contacts",
          "rfqs",
          "documents",
        ].includes(kind)
      )
        throw fail("Unknown lookup.", 404);
      const query = String(req.query.q || "")
          .toLowerCase()
          .replace(/[\\%_]/g, "\\$&"),
        page = Math.max(1, Number(req.query.page) || 1);
      res.json(
        db
          .prepare(
            "SELECT id,name FROM records WHERE workspace=? AND kind=? AND lower(name) LIKE ? ESCAPE '\\' ORDER BY name LIMIT 30 OFFSET ?",
          )
          .all(req.user.workspace, kind, "%" + query + "%", (page - 1) * 30),
      );
    }),
  );
  app.get("/api/services/stock-freshness", (req, res) => {
    const today = Date.now(),
      data = allData(req.user.workspace);
    res.json(
      data.products
        .flatMap((p) =>
          (p.quotes || []).map((q) => ({
            productId: p.id,
            product: p.name,
            vendorId: q.vendorId,
            vendor: data.vendors.find((v) => v.id === q.vendorId)?.name,
            price: q.price,
            stock: q.stock,
            confirmedAt: q.confirmedAt || null,
            validUntil: q.validUntil || null,
            stale:
              !q.confirmedAt ||
              today - Date.parse(q.confirmedAt) > 7 * 86400000,
            expired:
              !!q.validUntil &&
              q.validUntil < new Date().toISOString().slice(0, 10),
          })),
        )
        .slice(0, 500),
    );
  });
  app.post(
    "/api/services/stock-confirmation",
    wrap((req, res) => {
      if (req.user.role === "viewer") throw fail("Read-only account.", 403);
      const p = ops.base(req.user.workspace, "products", req.body.productId),
        quote = p.quotes.find((q) => q.vendorId === req.body.vendorId);
      if (!quote) throw fail("Choose an existing supplier price.");
      const row = {
        ...p,
        quotes: p.quotes.map((q) =>
          q.vendorId === quote.vendorId
            ? { ...q, confirmedAt: new Date().toISOString() }
            : q,
        ),
      };
      ops.updateBase(req.user, "products", row, p);
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/services/vendors/merge",
    wrap((req, res) => {
      owner(req);
      accounts.requirePassword(req);
      if (req.body.sourceId === req.body.targetId)
        throw fail("Choose two different vendors.");
      const source = ops.base(req.user.workspace, "vendors", req.body.sourceId),
        target = ops.base(req.user.workspace, "vendors", req.body.targetId),
        data = allData(req.user.workspace);
      if (!String(req.body.reason || "").trim())
        throw fail("Enter a merge reason.");
      if (
        data.products.some(
          (p) =>
            p.quotes?.some((q) => q.vendorId === source.id) &&
            p.quotes.some((q) => q.vendorId === target.id),
        ) ||
        data.rfqs.some(
          (r) =>
            r.responses?.some((q) => q.vendorId === source.id) &&
            r.responses.some((q) => q.vendorId === target.id),
        )
      )
        throw fail(
          "Both vendors have prices on the same product or RFQ. Reconcile those prices before merging.",
          409,
        );
      if (
        db
          .prepare(
            "SELECT id FROM approvals WHERE workspace=? AND status='Pending' AND target_id IN (?,?)",
          )
          .get(req.user.workspace, source.id, target.id)
      )
        throw fail("Resolve pending vendor approvals before merging.", 409);
      transaction(db, () => {
        for (const [kind, rows] of Object.entries(data)) {
          if (kind === "vendors") continue;
          for (const row of rows) {
            const next = structuredClone(row);
            let changed = false;
            if (next.vendorId === source.id) {
              next.vendorId = target.id;
              changed = true;
            }
            if (next.vendorIds?.includes(source.id)) {
              next.vendorIds = [
                ...new Set(
                  next.vendorIds.map((id) =>
                    id === source.id ? target.id : id,
                  ),
                ),
              ];
              changed = true;
            }
            for (const key of ["quotes", "responses"])
              if (next[key]?.some((q) => q.vendorId === source.id)) {
                next[key] = next[key].map((q) =>
                  q.vendorId === source.id ? { ...q, vendorId: target.id } : q,
                );
                changed = true;
              }
            if (changed) ops.updateBase(req.user, kind, next, row);
          }
        }
        const opData = ops.operations(req.user.workspace);
        for (const [kind, rows] of Object.entries(opData))
          for (const row of rows)
            if (row.vendorId === source.id)
              ops.put(req.user, kind, { ...row, vendorId: target.id }, row);
        ops.updateBase(
          req.user,
          "vendors",
          { ...source, status: "Archived" },
          source,
        );
        ops.setMetadata(req.user.workspace, "vendors", source.id, {
          ...ops.metadata(req.user.workspace, "vendors", source.id),
          mergedInto: target.id,
          mergeReason: String(req.body.reason).slice(0, 1000),
        });
        audit(
          db,
          req.user,
          "vendors merged",
          "vendors",
          source.id,
          { sourceId: source.id },
          { targetId: target.id, reason: req.body.reason },
        );
      });
      res.json({
        ok: true,
        notice:
          "Relationships reassigned; source vendor retained as archived history.",
      });
    }),
  );
  app.get("/api/services/api-keys", (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Owner access required." });
    res.json(
      db
        .prepare(
          "SELECT id,name,scopes,expires,revoked,last_used FROM api_keys WHERE workspace=?",
        )
        .all(req.user.workspace),
    );
  });
  app.post(
    "/api/services/api-keys",
    wrap((req, res) => {
      owner(req);
      accounts.requirePassword(req);
      const scopes = req.body.scopes;
      if (
        !Array.isArray(scopes) ||
        !scopes.length ||
        scopes.some(
          (s) => !["vendors:read", "products:read", "rfqs:read"].includes(s),
        )
      )
        throw fail("Choose supported read-only scopes.");
      const days = Math.min(90, Math.max(1, Number(req.body.days) || 30)),
        id = randomUUID(),
        raw = "ofcrm_" + randomBytes(32).toString("hex");
      db.prepare(
        "INSERT INTO api_keys(id,workspace,hash,name,scopes,expires) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        req.user.workspace,
        digest(raw),
        String(req.body.name || "Integration").slice(0, 100),
        JSON.stringify(scopes),
        Date.now() + days * 86400000,
      );
      audit(db, req.user, "API key created", "integration", id, null, {
        scopes,
        days,
      });
      res.status(201).json({
        id,
        key: raw,
        notice: "Copy this key now. It will not be shown again.",
      });
    }),
  );
  app.delete("/api/services/api-keys/:id", (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Owner access required." });
    db.prepare("UPDATE api_keys SET revoked=? WHERE workspace=? AND id=?").run(
      new Date().toISOString(),
      req.user.workspace,
      req.params.id,
    );
    res.json({ ok: true });
  });
  app.get("/api/integrations/records/:kind", (req, res) => {
    const key = db
        .prepare(
          "SELECT * FROM api_keys WHERE hash=? AND revoked IS NULL AND expires>?",
        )
        .get(
          digest(
            String(req.headers.authorization || "").replace(/^Bearer /, ""),
          ),
          Date.now(),
        ),
      kind = req.params.kind;
    if (!key || !JSON.parse(key.scopes).includes(kind + ":read"))
      return res
        .status(403)
        .json({ error: "Invalid, expired or insufficiently scoped API key." });
    db.prepare("UPDATE api_keys SET last_used=? WHERE id=?").run(
      new Date().toISOString(),
      key.id,
    );
    res.json(
      db
        .prepare(
          "SELECT payload FROM records WHERE workspace=? AND kind=? ORDER BY name LIMIT 100 OFFSET ?",
        )
        .all(key.workspace, kind, Math.max(0, Number(req.query.offset) || 0))
        .map((r) => JSON.parse(r.payload)),
    );
  });
  app.get("/api/services/webhooks", (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Owner access required." });
    res.json(
      db
        .prepare(
          "SELECT id,event_id,status,attempts,created,error FROM webhook_jobs WHERE workspace=? ORDER BY created DESC LIMIT 100",
        )
        .all(req.user.workspace),
    );
  });
  app.post(
    "/api/services/webhooks/:id/send",
    wrap(async (req, res) => {
      owner(req);
      const job = db
          .prepare("SELECT * FROM webhook_jobs WHERE id=? AND workspace=?")
          .get(req.params.id, req.user.workspace),
        hook = ops.config(req.user.workspace).webhook;
      if (!job || !hook)
        throw fail("Configure a webhook and generate events first.");
      if (job.status === "sent") return res.json({ status: "sent" });
      if (job.status === "sending")
        throw fail("Delivery is already in progress.", 409);
      const url = new URL(hook.url),
        allow = (process.env.CRM_WEBHOOK_ALLOWED_HOSTS || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      if (url.protocol !== "https:" || !allow.includes(url.hostname))
        throw fail(
          "The operator must allowlist this HTTPS webhook host before dispatch.",
          503,
        );
      const body = secretVault.open(job.encrypted_body).toString(),
        secret = secretVault.open(hook.secret).toString(),
        timestamp = String(Date.now());
      db.prepare(
        "UPDATE webhook_jobs SET status='sending',attempts=attempts+1 WHERE id=?",
      ).run(job.id);
      try {
        const r = await fetch(url, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            "X-OfNeeds-Event": job.event_id,
            "X-OfNeeds-Timestamp": timestamp,
            "X-OfNeeds-Signature": createHmac("sha256", secret)
              .update(timestamp + "." + body)
              .digest("hex"),
          },
          body,
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw Error("Rejected");
        db.prepare(
          "UPDATE webhook_jobs SET status='sent',error=NULL WHERE id=?",
        ).run(job.id);
        res.json({ status: "sent" });
      } catch {
        db.prepare(
          "UPDATE webhook_jobs SET status='failed',error='Delivery failed; confirm receiver state before retry.' WHERE id=?",
        ).run(job.id);
        res.json({ status: "failed" });
      }
    }),
  );
  app.get("/api/services/billing", (req, res) => {
    let catalog = {};
    try {
      catalog = JSON.parse(process.env.CRM_BILLING_CATALOG_JSON || "{}");
    } catch {}
    res.json({
      subscription: ops.config(req.user.workspace).subscription || {
        plan: "local",
        status: "local",
        notice: "Local workspace; no payment collected.",
      },
      usage: {
        vendors: db
          .prepare(
            "SELECT count(*) n FROM records WHERE workspace=? AND kind='vendors'",
          )
          .get(req.user.workspace).n,
        seats: db
          .prepare("SELECT count(*) n FROM users WHERE workspace=?")
          .get(req.user.workspace).n,
      },
      limits: ops.limits(req.user.workspace),
      catalog,
      requests: db
        .prepare(
          "SELECT * FROM subscription_requests WHERE workspace=? ORDER BY created DESC LIMIT 20",
        )
        .all(req.user.workspace),
    });
  });
  app.post(
    "/api/services/billing/request",
    wrap((req, res) => {
      owner(req);
      if (!["team", "enterprise"].includes(req.body.plan))
        throw fail("Choose Team or Enterprise.");
      const id = randomUUID();
      db.prepare(
        "INSERT INTO subscription_requests(id,workspace,plan,status,created) VALUES(?,?,?,?,?)",
      ).run(
        id,
        req.user.workspace,
        req.body.plan,
        "Requested",
        new Date().toISOString(),
      );
      res.status(201).json({
        id,
        status: "Requested",
        notice:
          "Plan request saved. No charge or paid activation has occurred.",
      });
    }),
  );
  app.post(
    "/api/billing/webhook",
    wrap((req, res) => {
      const secret = process.env.CRM_BILLING_WEBHOOK_SECRET;
      if (!secret)
        return res
          .status(503)
          .json({ error: "Billing webhook is not configured." });
      const supplied = String(req.headers["x-ofneeds-signature"] || ""),
        expected = createHmac("sha256", secret)
          .update(req.rawBody || "")
          .digest("hex");
      if (
        !/^[a-f0-9]{64}$/i.test(supplied) ||
        !timingSafeEqual(
          Buffer.from(supplied, "hex"),
          Buffer.from(expected, "hex"),
        )
      )
        throw fail("Invalid billing signature.", 401);
      const body = req.body,
        row = db
          .prepare("SELECT * FROM subscription_requests WHERE id=?")
          .get(body.requestId);
      if (
        !row ||
        !["paid", "refunded"].includes(body.status) ||
        !String(body.eventId || "").trim()
      )
        throw fail("Invalid billing event.");
      if (
        db
          .prepare("SELECT 1 FROM billing_events WHERE event_id=?")
          .get(body.eventId)
      )
        return res.json({ ok: true, duplicate: true });
      const catalog = JSON.parse(process.env.CRM_BILLING_CATALOG_JSON || "{}"),
        price = catalog[row.plan]?.amountPaise;
      if (
        body.status === "paid" &&
        (!Number.isSafeInteger(price) ||
          price < 1 ||
          body.amountPaise !== price ||
          body.currency !== "INR" ||
          !Number.isFinite(Date.parse(body.termEnd)) ||
          Date.parse(body.termEnd) <= Date.now())
      )
        throw fail(
          "Amount, currency or paid term does not match the configured plan.",
        );
      transaction(db, () => {
        const cfg = ops.config(row.workspace);
        cfg.subscription =
          body.status === "paid"
            ? {
                plan: row.plan,
                status: "active",
                termEnd: body.termEnd,
                reference: String(body.reference || "").slice(0, 100),
              }
            : { plan: "local", status: "refunded" };
        db.prepare("INSERT OR REPLACE INTO workspace_config VALUES(?,?)").run(
          row.workspace,
          JSON.stringify(cfg),
        );
        db.prepare(
          "UPDATE subscription_requests SET status=?,provider_reference=? WHERE id=?",
        ).run(body.status, String(body.reference || ""), row.id);
        db.prepare("INSERT INTO billing_events VALUES(?,?)").run(
          body.eventId,
          new Date().toISOString(),
        );
        audit(
          db,
          { id: "billing-provider", workspace: row.workspace },
          "subscription " + body.status,
          "billing",
          row.id,
          null,
          cfg.subscription,
        );
      });
      res.json({ ok: true });
    }),
  );
  app.use(
    "/api/crm",
    wrap(async (req, res, next) => {
      if (!["POST", "PATCH", "DELETE"].includes(req.method)) return next();
      const user = req.user,
        path = req.path;
      if (
        path === "/import" &&
        req.method === "POST" &&
        Array.isArray(req.body.rows) &&
        db
          .prepare(
            "SELECT count(*) n FROM records WHERE workspace=? AND kind='vendors'",
          )
          .get(user.workspace).n +
          req.body.rows.length >
          ops.limits(user.workspace).vendors
      )
        throw fail("Import exceeds the workspace vendor limit.", 403);
      if (
        path === "/team" &&
        req.method === "POST" &&
        db
          .prepare("SELECT count(*) n FROM users WHERE workspace=?")
          .get(user.workspace).n >= ops.limits(user.workspace).seats
      )
        throw fail("Workspace seat limit reached.", 403);
      const match = path.match(
        /^\/(vendors|products|brands|documents|rfqs)(?:\/([^/]+))?(?:\/file)?$/,
      );
      if (match) {
        const kind = match[1],
          id = match[2],
          old = id ? ops.base(user.workspace, kind, id) : null;
        if (req.method === "DELETE" && id) {
          if (
            kind === "documents" &&
            db
              .prepare(
                "SELECT 1 FROM approvals WHERE workspace=? AND status IN ('Pending','Approved') AND json_extract(proposal,'$.documentId')=?",
              )
              .get(user.workspace, id)
          )
            throw fail(
              "This evidence is retained for an approval. Create a new document version.",
              409,
            );
          const related = ops.operations(user.workspace);
          if (
            Object.values(related)
              .flat()
              .some(
                (r) =>
                  r.vendorId === id ||
                  r.productId === id ||
                  r.artworkDocumentId === id ||
                  r.documentId === id ||
                  r.lines?.some((l) => l.productId === id),
              )
          )
            throw fail(
              "This record is used by an operations workflow. Preserve it for history.",
              409,
            );
        }
        if (kind === "vendors") {
          if (
            req.method === "POST" &&
            db
              .prepare(
                "SELECT count(*) n FROM records WHERE workspace=? AND kind='vendors'",
              )
              .get(user.workspace).n >= ops.limits(user.workspace).vendors
          )
            throw fail("Workspace vendor limit reached.", 403);
          if (
            req.body.authorization === "Authorized" &&
            (old?.authorization !== "Authorized" ||
              String(req.body.authorizationUntil || "") !==
                String(old?.authorizationUntil || ""))
          )
            throw fail(
              "Use the vendor review workflow with supporting evidence to authorize this vendor.",
              409,
            );
          if (req.method === "POST" && user.role !== "owner") {
            req.body.status = "Pending";
            req.body.authorization = "Unverified";
          }
        }
        if (kind === "documents" && path.endsWith("/file")) {
          await scanUpload(req, user);
          if (
            db
              .prepare("SELECT 1 FROM files WHERE workspace=? AND record_id=?")
              .get(user.workspace, id) &&
            (db
              .prepare(
                "SELECT 1 FROM approvals WHERE workspace=? AND status IN ('Pending','Approved') AND json_extract(proposal,'$.documentId')=?",
              )
              .get(user.workspace, id) ||
              db
                .prepare(
                  "SELECT 1 FROM workflow_records WHERE workspace=? AND (json_extract(payload,'$.documentId')=? OR json_extract(payload,'$.artworkDocumentId')=?) AND json_extract(payload,'$.status') IN ('Submitted','Approved','Accepted')",
                )
                .get(user.workspace, id, id))
          )
            throw fail(
              "This attachment is part of a submitted or approved version. Upload a new document version.",
              409,
            );
        }
      }
      return next();
    }),
  );

  async function scanUpload(req, user) {
    const bytes = Buffer.from(String(req.body.base64 || ""), "base64"),
      mime = req.body.mime;
    if (!bytes.length || bytes.length > 4000000)
      throw fail("Upload a file under 4 MB.");
    const signatures = {
      "application/pdf": () => bytes.subarray(0, 5).toString() === "%PDF-",
      "image/png": () =>
        bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
      "image/jpeg": () => bytes[0] === 255 && bytes[1] === 216,
      "text/plain": () => !bytes.includes(0),
    };
    if (!signatures[mime]?.())
      throw fail(
        "File content does not match an allowed PDF, PNG, JPG or text file.",
      );
    const used = db
        .prepare(
          "SELECT COALESCE(sum(length(content)),0) n FROM files WHERE workspace=?",
        )
        .get(user.workspace).n,
      existing =
        db
          .prepare(
            "SELECT length(content) n FROM files WHERE record_id=? AND workspace=?",
          )
          .get(req.params?.id || req.path.split("/")[2], user.workspace)?.n ||
        0;
    if (used - existing + bytes.length > ops.limits(user.workspace).storage)
      throw fail("Workspace document storage limit reached.", 413);
    const endpoint = process.env.CRM_SCAN_GATEWAY_URL,
      token = process.env.CRM_SCAN_GATEWAY_TOKEN;
    if (!endpoint || !token) {
      if (production)
        throw fail(
          "Document scanning must be configured before production uploads.",
          503,
        );
      return;
    }
    if (new URL(endpoint).protocol !== "https:")
      throw fail("The scanner must use HTTPS.", 503);
    const scan = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ base64: req.body.base64, mime }),
      signal: AbortSignal.timeout(15000),
    });
    if (!scan.ok || (await scan.json()).clean !== true)
      throw fail("The scanner did not approve this file.", 422);
  }
  const interval = Math.max(
    0,
    Number(process.env.CRM_AUTOMATION_INTERVAL_SECONDS ?? 60),
  );
  const timer = interval
    ? setInterval(
        () => {
          for (const workspace of db
            .prepare("SELECT id FROM workspaces")
            .all()) {
            try {
              jobs(workspace.id);
            } catch {
              console.error(
                "Scheduled local workflow could not complete. Check service configuration.",
              );
            }
          }
        },
        Math.max(interval, 30) * 1000,
      )
    : null;
  timer?.unref();
  return { jobs, scanUpload, notify };
}
