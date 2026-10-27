import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import {
  operationKinds,
  validateOperation,
  operationLinks,
  landedCost,
  orderTotals,
  receiveOrder,
  performance,
} from "../shared/operations.mjs";
import { validateRecord, validateLinks, csv } from "../shared/core.mjs";
import { audit, auditValid, digest } from "./security.mjs";
import { transaction, log } from "./store.mjs";
export function migrateOperations(db) {
  db.exec(`
 CREATE TABLE IF NOT EXISTS workflow_records(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,kind TEXT NOT NULL,name TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS workflow_scope ON workflow_records(workspace,kind,name);
 CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,type TEXT NOT NULL,target_id TEXT NOT NULL,requested_by TEXT NOT NULL,revision_hash TEXT NOT NULL,proposal TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,decided_by TEXT,created TEXT NOT NULL,decided TEXT);
 CREATE TABLE IF NOT EXISTS workspace_config(workspace TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS record_metadata(workspace TEXT NOT NULL,kind TEXT NOT NULL,record_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workspace,kind,record_id));
 CREATE TABLE IF NOT EXISTS action_receipts(workspace TEXT NOT NULL,key TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(workspace,key));
 CREATE TABLE IF NOT EXISTS portal_sessions(hash TEXT PRIMARY KEY,grant_hash TEXT NOT NULL,workspace TEXT NOT NULL,vendor_id TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS automation_runs(workspace TEXT NOT NULL,rule_id TEXT NOT NULL,period TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(workspace,rule_id,period));
 CREATE TABLE IF NOT EXISTS report_snapshots(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,name TEXT NOT NULL,content TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS subscription_requests(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,provider_reference TEXT,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS billing_events(event_id TEXT PRIMARY KEY,created TEXT NOT NULL);
 `);
}
export function installOperations({
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
}) {
  migrateOperations(db);
  const fail = (message, status = 400) =>
    Object.assign(Error(message), { status });
  const actor = (req, res, next) => {
    const user = current(req);
    if (!user)
      return res.status(401).json({ error: "Sign in to your workspace." });
    req.user = user;
    next();
  };
  const write = (req) => {
    if (req.user.role === "viewer") throw fail("Your role is read-only.", 403);
  };
  const owner = (req) => {
    if (req.user.role !== "owner")
      throw fail("Workspace owner approval is required.", 403);
  };
  const config = (workspace) =>
    JSON.parse(
      db
        .prepare("SELECT payload FROM workspace_config WHERE workspace=?")
        .get(workspace)?.payload || "{}",
    );
  const operations = (workspace) => {
    const data = Object.fromEntries(operationKinds.map((k) => [k, []]));
    for (const row of db
      .prepare("SELECT kind,payload FROM workflow_records WHERE workspace=?")
      .all(workspace))
      data[row.kind]?.push(JSON.parse(row.payload));
    return data;
  };
  const base = (workspace, kind, id) => {
    const row = db
      .prepare(
        "SELECT payload FROM records WHERE workspace=? AND kind=? AND id=?",
      )
      .get(workspace, kind, id);
    if (!row) throw fail("Record not found in this workspace.", 404);
    return JSON.parse(row.payload);
  };
  const get = (workspace, kind, id) => {
    const row = db
      .prepare(
        "SELECT payload FROM workflow_records WHERE workspace=? AND kind=? AND id=?",
      )
      .get(workspace, kind, id);
    if (!row) throw fail("Operations record not found.", 404);
    return JSON.parse(row.payload);
  };
  const put = (user, kind, row, previous = null) => {
    row = {
      ...row,
      revision: (previous?.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO workflow_records(id,workspace,kind,name,payload,created) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,payload=excluded.payload",
    ).run(
      row.id,
      user.workspace,
      kind,
      row.name,
      JSON.stringify(row),
      row.createdAt || new Date().toISOString(),
    );
    audit(
      db,
      user,
      previous ? "operations updated" : "operations created",
      kind,
      row.id,
      previous,
      row,
    );
    if (kind === "comments")
      for (const member of row.mentions || [])
        app.locals.notify?.(
          user.workspace,
          member,
          `You were mentioned: ${row.name}`,
          row.targetKind,
          row.targetId,
          `mention:${row.id}:${member}`,
        );
    return row;
  };
  const updateBase = (user, kind, row, previous) => {
    db.prepare(
      "UPDATE records SET name=?,payload=? WHERE id=? AND workspace=? AND kind=?",
    ).run(
      row.name,
      JSON.stringify({ ...row, revision: (previous.revision || 0) + 1 }),
      row.id,
      user.workspace,
      kind,
    );
    audit(db, user, "record updated", kind, row.id, previous, row);
  };
  const members = (workspace) =>
    db
      .prepare("SELECT id,name,email,role FROM users WHERE workspace=?")
      .all(workspace);
  const metadata = (workspace, kind, id) =>
    JSON.parse(
      db
        .prepare(
          "SELECT payload FROM record_metadata WHERE workspace=? AND kind=? AND record_id=?",
        )
        .get(workspace, kind, id)?.payload || "{}",
    );
  const setMetadata = (workspace, kind, id, payload) =>
    db
      .prepare("INSERT OR REPLACE INTO record_metadata VALUES(?,?,?,?)")
      .run(workspace, kind, id, JSON.stringify(payload));
  function checkLinks(user, row) {
    operationLinks(
      row,
      allData(user.workspace),
      operations(user.workspace),
      members(user.workspace),
    );
  }
  function limits(workspace) {
    const cfg = config(workspace),
      plan =
        cfg.subscription?.status === "active" &&
        Date.parse(cfg.subscription.termEnd) > Date.now()
          ? cfg.subscription.plan
          : "local";
    const tiers = {
      local: { vendors: 5000, seats: 25, storage: 100000000 },
      team: { vendors: 25000, seats: 100, storage: 1000000000 },
      enterprise: { vendors: 100000, seats: 500, storage: 5000000000 },
    };
    return { plan, ...(tiers[plan] || tiers.local) };
  }
  function requestApproval(user, type, target, proposal) {
    const previous = db
      .prepare(
        "SELECT id FROM approvals WHERE workspace=? AND type=? AND target_id=? AND status='Pending'",
      )
      .get(user.workspace, type, target.id);
    if (previous)
      throw fail("A pending approval already exists for this record.", 409);
    const row = {
      id: randomUUID(),
      workspace: user.workspace,
      type,
      target_id: target.id,
      requested_by: user.id,
      revision_hash: digest(JSON.stringify(target)),
      proposal: JSON.stringify(proposal),
      status: "Pending",
      created: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO approvals(id,workspace,type,target_id,requested_by,revision_hash,proposal,status,created) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      row.id,
      row.workspace,
      row.type,
      row.target_id,
      row.requested_by,
      row.revision_hash,
      row.proposal,
      row.status,
      row.created,
    );
    audit(db, user, "approval requested", type, target.id, null, proposal);
    return row;
  }
  app.use("/api/ops", actor);
  app.get("/api/ops/overview", (req, res) => {
    const data = operations(req.user.workspace),
      users = members(req.user.workspace),
      cfg = config(req.user.workspace);
    res.json({
      counts: Object.fromEntries(
        operationKinds.map((k) => [k, data[k].length]),
      ),
      config: {
        ...cfg,
        webhook: cfg.webhook
          ? { url: cfg.webhook.url, configured: true }
          : null,
      },
      limits: limits(req.user.workspace),
      members: users,
      delivery: {
        email: delivery.ready("email"),
        whatsapp: delivery.ready("whatsapp"),
      },
      portalLinks: db
        .prepare(
          "SELECT hash id,email,vendor_id,expires,used_at FROM access_tokens WHERE workspace=? AND type='portal' ORDER BY expires DESC LIMIT 100",
        )
        .all(req.user.workspace),
    });
  });
  app.get(
    "/api/ops/records/:kind",
    wrap((req, res) => {
      const kind = req.params.kind;
      if (!operationKinds.includes(kind))
        throw fail("Unknown operations module.", 404);
      const filters = ["workspace=?", "kind=?"],
        args = [req.user.workspace, kind];
      if (req.query.q) {
        filters.push("lower(payload) LIKE ?");
        args.push("%" + String(req.query.q).toLowerCase() + "%");
      }
      for (const key of ["vendorId", "projectId", "status"])
        if (req.query[key]) {
          filters.push(`json_extract(payload,'$.${key}')=?`);
          args.push(String(req.query[key]));
        }
      const page = Math.max(1, Number(req.query.page) || 1),
        limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20)),
        where = filters.join(" AND ");
      res.json({
        rows: db
          .prepare(
            `SELECT payload FROM workflow_records WHERE ${where} ORDER BY created DESC LIMIT ? OFFSET ?`,
          )
          .all(...args, limit, (page - 1) * limit)
          .map((r) => JSON.parse(r.payload)),
        total: db
          .prepare(`SELECT count(*) n FROM workflow_records WHERE ${where}`)
          .get(...args).n,
        page,
        limit,
      });
    }),
  );
  app.post(
    "/api/ops/records/:kind",
    wrap((req, res) => {
      write(req);
      const kind = req.params.kind,
        value = validateOperation(kind, req.body);
      checkLinks(req.user, value);
      if (["verifications", "report-schedules"].includes(kind)) owner(req);
      const row = {
        ...value,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        createdBy: req.user.id,
        status:
          kind === "projects"
            ? value.status
            : kind === "comments"
              ? "Posted"
              : "Draft",
      };
      if (kind === "orders") {
        const n =
          db
            .prepare(
              "SELECT count(*) n FROM workflow_records WHERE workspace=? AND kind='orders'",
            )
            .get(req.user.workspace).n + 1;
        row.number = `PO-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
        row.received = {};
      }
      res.status(201).json(put(req.user, kind, row));
    }),
  );
  app.patch(
    "/api/ops/records/:kind/:id",
    wrap((req, res) => {
      write(req);
      const { kind, id } = req.params,
        previous = get(req.user.workspace, kind, id);
      if (["verifications", "report-schedules"].includes(kind)) owner(req);
      if (kind === "orders" && previous.status !== "Draft")
        throw fail(
          "Only draft orders can be edited. Cancel and replace an approved order.",
          409,
        );
      if (
        ["customizations", "samples", "verifications"].includes(kind) &&
        ["Approved", "Accepted"].includes(previous.status)
      )
        throw fail("Create a new version to revise an approved record.", 409);
      if (req.body.revision && Number(req.body.revision) !== previous.revision)
        throw fail("This record changed. Refresh before editing.", 409);
      const value = validateOperation(kind, { ...previous, ...req.body });
      checkLinks(req.user, value);
      res.json(put(req.user, kind, { ...previous, ...value }, previous));
    }),
  );
  app.get("/api/ops/approvals", (req, res) =>
    res.json(
      db
        .prepare(
          "SELECT * FROM approvals WHERE workspace=? ORDER BY created DESC LIMIT 100",
        )
        .all(req.user.workspace)
        .map((r) => ({
          ...r,
          targetName:
            db
              .prepare(
                "SELECT name FROM records WHERE workspace=? AND id=? UNION ALL SELECT name FROM workflow_records WHERE workspace=? AND id=? LIMIT 1",
              )
              .get(
                req.user.workspace,
                r.target_id,
                req.user.workspace,
                r.target_id,
              )?.name || r.target_id,
          proposal: JSON.parse(r.proposal),
        })),
    ),
  );
  app.post(
    "/api/ops/orders/:id/submit",
    wrap((req, res) => {
      write(req);
      const order = get(req.user.workspace, "orders", req.params.id);
      if (order.status !== "Draft")
        throw fail("Only draft orders can be submitted.", 409);
      transaction(db, () => {
        const submitted = put(
          req.user,
          "orders",
          { ...order, status: "Pending approval" },
          order,
        );
        requestApproval(req.user, "purchase-order", submitted, {
          orderId: order.id,
          order: submitted,
        });
      });
      const stored = get(req.user.workspace, "orders", order.id);
      res.json(stored);
    }),
  );
  app.post(
    "/api/ops/rfqs/:id/award",
    wrap((req, res) => {
      write(req);
      const rfq = base(req.user.workspace, "rfqs", req.params.id),
        quote = rfq.responses?.find((q) => q.vendorId === req.body.vendorId);
      if (!quote) throw fail("Select a supplier with a recorded RFQ response.");
      if (
        quote.validUntil &&
        quote.validUntil < new Date().toISOString().slice(0, 10)
      )
        throw fail("This quotation has expired. Request a revision.");
      if (
        Number(rfq.quantity) < Number(quote.moq) ||
        Number(rfq.quantity) > Number(quote.stock)
      )
        throw fail("The quotation does not meet quantity requirements.");
      const cost = landedCost(quote, rfq.quantity);
      res.status(201).json(
        requestApproval(req.user, "quotation-award", rfq, {
          vendorId: quote.vendorId,
          supplier: base(req.user.workspace, "vendors", quote.vendorId).name,
          quantity: rfq.quantity,
          quote,
          cost,
          rfqId: rfq.id,
        }),
      );
    }),
  );
  app.post(
    "/api/ops/vendors/:id/review-request",
    wrap((req, res) => {
      write(req);
      const vendor = base(req.user.workspace, "vendors", req.params.id);
      let document = null;
      if (req.body.documentId) {
        document = base(req.user.workspace, "documents", req.body.documentId);
        if (document.vendorId !== vendor.id)
          throw fail("Choose evidence belonging to this vendor.");
      }
      if (
        req.body.authorization === "Authorized" &&
        (!document ||
          !db
            .prepare(
              "SELECT record_id FROM files WHERE record_id=? AND workspace=?",
            )
            .get(document.id, req.user.workspace))
      )
        throw fail(
          "Upload supporting evidence before requesting authorization.",
        );
      res.status(201).json(
        requestApproval(req.user, "vendor-review", vendor, {
          authorization:
            req.body.authorization === "Authorized"
              ? "Authorized"
              : "Unverified",
          status: "Active",
          documentId: document?.id || null,
          documentName: document?.name || "",
          evidenceHash: document
            ? digest(
                JSON.stringify(document) +
                  digest(
                    Buffer.from(
                      db
                        .prepare(
                          "SELECT content FROM files WHERE record_id=? AND workspace=?",
                        )
                        .get(document.id, req.user.workspace)?.content || [],
                    ),
                  ),
              )
            : null,
          validUntil: String(req.body.validUntil || "").slice(0, 10),
          reason: String(req.body.reason || "").slice(0, 1000),
        }),
      );
    }),
  );
  app.post(
    "/api/ops/approvals/:id/decide",
    wrap((req, res) => {
      owner(req);
      const approval = db
        .prepare(
          "SELECT * FROM approvals WHERE workspace=? AND id=? AND status='Pending'",
        )
        .get(req.user.workspace, req.params.id);
      if (!approval) throw fail("Pending approval not found.", 404);
      if (
        !["Approved", "Rejected"].includes(req.body.decision) ||
        !String(req.body.reason || "").trim()
      )
        throw fail("Choose a decision and enter a reason.");
      const proposal = JSON.parse(approval.proposal);
      transaction(db, () => {
        if (req.body.decision === "Approved") {
          if (approval.type === "purchase-order") {
            const order = get(req.user.workspace, "orders", approval.target_id);
            if (digest(JSON.stringify(order)) !== approval.revision_hash)
              throw fail("Order changed after submission. Submit again.", 409);
            put(
              req.user,
              "orders",
              {
                ...order,
                status: "Approved",
                approvedBy: req.user.id,
                approvedAt: new Date().toISOString(),
              },
              order,
            );
          } else {
            const kind =
                approval.type === "quotation-award" ? "rfqs" : "vendors",
              target = base(req.user.workspace, kind, approval.target_id);
            if (digest(JSON.stringify(target)) !== approval.revision_hash)
              throw fail(
                "The record changed after submission. Request a fresh review.",
                409,
              );
            if (approval.type === "quotation-award") {
              const quote = target.responses?.find(
                (q) => q.vendorId === proposal.vendorId,
              );
              if (
                !quote ||
                (quote.validUntil &&
                  quote.validUntil < new Date().toISOString().slice(0, 10))
              )
                throw fail(
                  "This quotation expired. Request a current response.",
                  409,
                );
              setMetadata(req.user.workspace, "rfqs", target.id, {
                ...metadata(req.user.workspace, "rfqs", target.id),
                award: {
                  ...proposal,
                  approvalId: approval.id,
                  revisionHash: approval.revision_hash,
                  approvedBy: req.user.id,
                },
              });
            } else if (approval.type === "vendor-profile") {
              const { name, contact, email, phone, address, city, state } =
                proposal;
              const next = validateRecord("vendors", {
                ...target,
                name,
                contact,
                email,
                phone,
                address,
                city,
                state,
              });
              updateBase(req.user, "vendors", { ...target, ...next }, target);
            } else {
              if (proposal.authorization === "Authorized") {
                const document = base(
                  req.user.workspace,
                  "documents",
                  proposal.documentId,
                );
                const file = db
                  .prepare(
                    "SELECT content FROM files WHERE record_id=? AND workspace=?",
                  )
                  .get(document.id, req.user.workspace);
                if (
                  !file ||
                  document.vendorId !== target.id ||
                  digest(
                    JSON.stringify(document) +
                      digest(Buffer.from(file.content)),
                  ) !== proposal.evidenceHash
                )
                  throw fail(
                    "Supporting evidence changed. Request a fresh review.",
                    409,
                  );
              }
              const next = {
                ...target,
                status: proposal.status,
                authorization: proposal.authorization,
                authorizationUntil: proposal.validUntil || undefined,
              };
              updateBase(req.user, "vendors", next, target);
            }
          }
        } else if (approval.type === "purchase-order") {
          const order = get(req.user.workspace, "orders", approval.target_id);
          put(req.user, "orders", { ...order, status: "Draft" }, order);
        }
        db.prepare(
          "UPDATE approvals SET status=?,reason=?,decided_by=?,decided=? WHERE id=?",
        ).run(
          req.body.decision,
          String(req.body.reason).slice(0, 1500),
          req.user.id,
          new Date().toISOString(),
          approval.id,
        );
        audit(
          db,
          req.user,
          "approval " + req.body.decision.toLowerCase(),
          approval.type,
          approval.target_id,
          null,
          { reason: req.body.reason, approvalId: approval.id },
        );
      });
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/ops/rfqs/:id/create-order",
    wrap((req, res) => {
      write(req);
      const rfq = base(req.user.workspace, "rfqs", req.params.id),
        award = metadata(req.user.workspace, "rfqs", rfq.id).award;
      if (!award || award.revisionHash !== digest(JSON.stringify(rfq)))
        throw fail(
          "Approve the current quotation award before converting it to an order.",
          409,
        );
      const quote = rfq.responses.find((q) => q.vendorId === award.vendorId),
        line = {
          ...quote,
          id: "line-1",
          productId: rfq.productId,
          quantity: Number(rfq.quantity),
          description: base(req.user.workspace, "products", rfq.productId).name,
        };
      if (
        !quote ||
        (quote.validUntil &&
          quote.validUntil < new Date().toISOString().slice(0, 10))
      )
        throw fail(
          "The approved quotation expired. Request a current response.",
          409,
        );
      const old = db
        .prepare(
          "SELECT payload FROM workflow_records WHERE workspace=? AND kind='orders' AND json_extract(payload,'$.rfqId')=? AND json_extract(payload,'$.status')!='Cancelled'",
        )
        .get(req.user.workspace, rfq.id);
      if (old) throw fail("An order already exists for this RFQ.", 409);
      const value = validateOperation("orders", {
        name: rfq.name,
        vendorId: award.vendorId,
        rfqId: rfq.id,
        lines: [line],
        dueDate: rfq.deadline || "",
        projectId: req.body.projectId || "",
      });
      checkLinks(req.user, value);
      res.status(201).json(
        put(req.user, "orders", {
          ...value,
          id: randomUUID(),
          number: `PO-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`,
          createdAt: new Date().toISOString(),
          createdBy: req.user.id,
          status: "Draft",
          received: {},
        }),
      );
    }),
  );
  app.post(
    "/api/ops/orders/:id/action",
    wrap((req, res) => {
      write(req);
      const order = get(req.user.workspace, "orders", req.params.id),
        action = req.body.action;
      let next = { ...order };
      if (action === "issue") {
        owner(req);
        if (order.status !== "Approved")
          throw fail("Approve the order before issuing it.", 409);
        next.status = "Issued";
        next.issuedAt = new Date().toISOString();
      } else if (action === "accept") {
        owner(req);
        if (order.status !== "Issued")
          throw fail("Only issued orders can be acknowledged.", 409);
        if (!String(req.body.reference || "").trim())
          throw fail("Record the supplier acknowledgement reference.");
        next.status = "Accepted";
        next.acknowledgement = req.body.reference;
      } else if (action === "receive") {
        const key = `receipt:${order.id}:${String(req.body.reference || "").trim()}`;
        if (!req.body.reference || String(req.body.reference).length > 100)
          throw fail("Enter a unique receipt reference.");
        const existing = db
          .prepare(
            "SELECT result FROM action_receipts WHERE workspace=? AND key=?",
          )
          .get(req.user.workspace, key);
        if (existing) return res.json(JSON.parse(existing.result));
        next = { ...order, ...receiveOrder(order, req.body.lines) };
        next.receipts = [
          ...(order.receipts || []),
          {
            reference: req.body.reference,
            lines: req.body.lines,
            date: new Date().toISOString(),
            actor: req.user.id,
          },
        ];
        if (next.status === "Completed")
          next.completedAt = new Date().toISOString();
        return transaction(db, () => {
          const saved = put(req.user, "orders", next, order);
          db.prepare("INSERT INTO action_receipts VALUES(?,?,?)").run(
            req.user.workspace,
            key,
            JSON.stringify(saved),
          );
          res.json(saved);
        });
      } else if (action === "cancel") {
        owner(req);
        if (
          ["Completed", "Partially received", "Cancelled"].includes(
            order.status,
          )
        )
          throw fail(
            "Received orders cannot be cancelled. Record an appropriate return separately.",
            409,
          );
        if (!String(req.body.reason || "").trim())
          throw fail("Enter a cancellation reason.");
        next.status = "Cancelled";
        next.cancellationReason = String(req.body.reason).slice(0, 1000);
        db.prepare(
          "UPDATE approvals SET status='Rejected',reason='Order cancelled' WHERE workspace=? AND target_id=? AND status='Pending'",
        ).run(req.user.workspace, order.id);
      } else throw fail("Unknown order action.");
      res.json(put(req.user, "orders", next, order));
    }),
  );
  app.post(
    "/api/ops/records/:kind/:id/transition",
    wrap((req, res) => {
      write(req);
      const { kind, id } = req.params,
        old = get(req.user.workspace, kind, id),
        status = req.body.status,
        allowed = {
          customizations: {
            Draft: ["Submitted"],
            Submitted: ["Approved", "Changes requested"],
            "Changes requested": ["Draft"],
          },
          samples: {
            Draft: ["Requested"],
            Requested: ["Received", "Cancelled"],
            Received: ["Accepted", "Rejected"],
          },
          verifications: { Draft: ["Approved", "Rejected"] },
          projects: {
            Planning: ["Sourcing", "Cancelled"],
            Sourcing: ["In progress", "Cancelled"],
            "In progress": ["Completed", "Cancelled"],
          },
        };
      if (!allowed[kind]?.[old.status]?.includes(status))
        throw fail("This status transition is not available.", 409);
      if (status === "Approved" || kind === "verifications") owner(req);
      if (
        ["Approved", "Rejected", "Changes requested"].includes(status) &&
        !String(req.body.reason || "").trim()
      )
        throw fail("Enter the review decision reason.");
      const next = {
        ...old,
        status,
        reviewedBy: req.user.id,
        decisionReason: String(req.body.reason || "").slice(0, 1000),
        decisionAt: new Date().toISOString(),
      };
      if (kind === "verifications" && status === "Approved") {
        const vendor = base(req.user.workspace, "vendors", old.vendorId);
        if (
          !db
            .prepare(
              "SELECT record_id FROM files WHERE record_id=? AND workspace=?",
            )
            .get(old.documentId, req.user.workspace)
        )
          throw fail("Attach the supporting evidence file first.");
        updateBase(
          req.user,
          "vendors",
          {
            ...vendor,
            authorization: "Authorized",
            authorizationUntil: old.validUntil || undefined,
          },
          vendor,
        );
      }
      res.json(put(req.user, kind, next, old));
    }),
  );
  app.get("/api/ops/scorecards/:vendorId", (req, res) => {
    const data = operations(req.user.workspace);
    res.json(performance(data.orders, data.scorecards, req.params.vendorId));
  });
  app.get("/api/ops/rfqs/:id/award", (req, res) =>
    res.json(metadata(req.user.workspace, "rfqs", req.params.id).award || null),
  );
  app.get(
    "/api/ops/metadata/:kind/:id",
    wrap((req, res) => {
      base(req.user.workspace, req.params.kind, req.params.id);
      res.json(metadata(req.user.workspace, req.params.kind, req.params.id));
    }),
  );
  app.patch(
    "/api/ops/metadata/:kind/:id",
    wrap((req, res) => {
      write(req);
      const { kind, id } = req.params;
      const record = base(req.user.workspace, kind, id),
        previous = metadata(req.user.workspace, kind, id),
        fields = config(req.user.workspace).customFields || [];
      const value = {
        notes: String(req.body.notes || "").slice(0, 5000),
        tags: Array.isArray(req.body.tags)
          ? req.body.tags.slice(0, 20).map((v) => String(v).slice(0, 50))
          : [],
        ownerId: String(req.body.ownerId || ""),
        customFields: {},
      };
      if (
        value.ownerId &&
        !members(req.user.workspace).some((m) => m.id === value.ownerId)
      )
        throw fail("Choose a current member.");
      for (const field of fields)
        if (req.body.customFields?.[field.key] !== undefined)
          value.customFields[field.key] = String(
            req.body.customFields[field.key],
          ).slice(0, 500);
      setMetadata(req.user.workspace, kind, id, { ...previous, ...value });
      audit(db, req.user, "record metadata updated", kind, id, previous, value);
      res.json(value);
    }),
  );
  app.patch(
    "/api/ops/config",
    wrap((req, res) => {
      owner(req);
      const previous = config(req.user.workspace),
        next = { ...previous };
      if (req.body.customFields) {
        if (
          !Array.isArray(req.body.customFields) ||
          req.body.customFields.length > 20
        )
          throw fail("Use up to 20 custom fields.");
        next.customFields = req.body.customFields.map((f) => {
          if (!/^[a-z][a-z0-9_]{0,39}$/.test(f.key) || !String(f.label).trim())
            throw fail("Use a lowercase field key and label.");
          return { key: f.key, label: String(f.label).slice(0, 80) };
        });
      }
      if (req.body.notifications !== undefined)
        next.notifications = !!req.body.notifications;
      let newWebhookSecret;
      if (req.body.webhook) {
        accounts.requirePassword(req);
        newWebhookSecret = randomBytes(32).toString("hex");
        const url = new URL(req.body.webhook.url);
        if (url.protocol !== "https:") throw fail("Use an HTTPS webhook URL.");
        next.webhook = {
          url: url.href,
          secret: secretVault.seal(newWebhookSecret),
        };
      }
      db.prepare("INSERT OR REPLACE INTO workspace_config VALUES(?,?)").run(
        req.user.workspace,
        JSON.stringify(next),
      );
      audit(
        db,
        req.user,
        "workspace configuration updated",
        "settings",
        "",
        null,
        {
          customFields: next.customFields,
          webhook: next.webhook ? { url: next.webhook.url } : null,
        },
      );
      res.json({
        ok: true,
        ...(newWebhookSecret ? { webhookSecret: newWebhookSecret } : {}),
      });
    }),
  );
  app.get("/api/ops/audit", (req, res) => {
    if (req.user.role !== "owner")
      return res
        .status(403)
        .json({ error: "Only the owner can view the full audit trail." });
    const all = db
        .prepare("SELECT * FROM audit_events WHERE workspace=? ORDER BY seq")
        .all(req.user.workspace),
      page = Math.max(1, Number(req.query.page) || 1);
    res.json({
      rows: all
        .slice(
          Math.max(0, all.length - page * 50),
          Math.max(0, all.length - (page - 1) * 50),
        )
        .reverse(),
      total: all.length,
      valid: auditValid(all),
    });
  });
  app.get("/api/ops/outbox", (req, res) => {
    if (req.user.role !== "owner")
      return res.status(403).json({ error: "Owner access required." });
    res.json(
      db
        .prepare(
          "SELECT id,channel,recipient,subject,status,attempts,last_error,created,sent FROM outbox WHERE workspace=? ORDER BY created DESC LIMIT 100",
        )
        .all(req.user.workspace),
    );
  });
  app.post(
    "/api/ops/outbox/:id/send",
    wrap(async (req, res) => {
      owner(req);
      const result = await delivery.send(req.params.id, req.user.workspace);
      audit(
        db,
        req.user,
        "delivery attempted",
        "outbox",
        req.params.id,
        null,
        result,
      );
      res.json(result);
    }),
  );
  app.post(
    "/api/ops/rfqs/:id/queue",
    wrap((req, res) => {
      write(req);
      const rfq = base(req.user.workspace, "rfqs", req.params.id),
        channel = req.body.channel || "email";
      if (!["email", "whatsapp"].includes(channel))
        throw fail("Choose email or WhatsApp.");
      const results = transaction(db, () =>
        rfq.vendorIds.map((id) => {
          const vendor = base(req.user.workspace, "vendors", id);
          return delivery.queue({
            workspace: req.user.workspace,
            channel,
            to: channel === "email" ? vendor.email : vendor.phone,
            subject: `RFQ: ${rfq.name}`,
            body: {
              text: `Please review ${rfq.name}: ${rfq.quantity} units. Deadline: ${rfq.deadline || "Contact procurement"}. Access your invited supplier portal to submit a response. ${rfq.notes || ""}`,
            },
            dedupe: `rfq:${rfq.id}:${digest(JSON.stringify(rfq))}:${id}:${channel}`,
          });
        }),
      );
      audit(db, req.user, "RFQ delivery queued", "rfqs", rfq.id, null, {
        channel,
        count: results.length,
      });
      res.json({
        messages: results,
        notice:
          "Queued messages are not sent until an owner explicitly dispatches them from Delivery.",
      });
    }),
  );
  app.post(
    "/api/ops/portal/invite",
    wrap((req, res) => {
      owner(req);
      accounts.requirePassword(req);
      const vendor = base(req.user.workspace, "vendors", req.body.vendorId),
        email = String(req.body.email || vendor.email || "")
          .trim()
          .toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email))
        throw fail("Enter a valid supplier email.");
      const raw = accounts.createToken(
          "portal",
          { workspace: req.user.workspace, vendorId: vendor.id, email },
          72 * 3600000,
        ),
        link = `${origin}/supplier-portal?token=${raw}`;
      const queued = delivery.queue({
        workspace: req.user.workspace,
        to: email,
        subject: "Your OfNeeds supplier workspace",
        body: {
          text: `Open this private link within 72 hours: ${link}\nIt grants access only to your supplier records, assigned RFQs and issued orders.`,
        },
      });
      audit(db, req.user, "supplier invited", "vendors", vendor.id, null, {
        email,
      });
      res.status(201).json({ ...queued, link, expiresInHours: 72 });
    }),
  );
  app.delete(
    "/api/ops/portal/:id",
    wrap((req, res) => {
      owner(req);
      db.prepare(
        "UPDATE access_tokens SET used_at=COALESCE(used_at,?),expires=0 WHERE hash=? AND workspace=? AND type='portal'",
      ).run(new Date().toISOString(), req.params.id, req.user.workspace);
      db.prepare(
        "DELETE FROM portal_sessions WHERE grant_hash=? AND workspace=?",
      ).run(req.params.id, req.user.workspace);
      res.json({ ok: true });
    }),
  );
  installPortal();
  function portal(req, res, next) {
    const raw = (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("ofneeds_supplier="))
      ?.slice(17);
    const grant =
      raw &&
      db
        .prepare(
          "SELECT p.* FROM portal_sessions p JOIN access_tokens a ON a.hash=p.grant_hash WHERE p.hash=? AND p.expires>? AND a.expires>?",
        )
        .get(digest(raw), Date.now(), Date.now());
    if (!grant)
      return res
        .status(401)
        .json({ error: "Open a valid supplier invitation link." });
    req.portal = grant;
    next();
  }
  function installPortal() {
    app.post(
      "/api/portal/exchange",
      wrap((req, res) => {
        const token = accounts.validToken(req.body.token, "portal"),
          raw = randomBytes(32).toString("hex");
        transaction(db, () => {
          accounts.useToken(token);
          db.prepare("INSERT INTO portal_sessions VALUES(?,?,?,?,?)").run(
            digest(raw),
            token.hash,
            token.workspace,
            token.vendor_id,
            Math.min(token.expires, Date.now() + 72 * 3600000),
          );
        });
        res.cookie("ofneeds_supplier", raw, {
          httpOnly: true,
          sameSite: "lax",
          secure: production,
          path: "/api/portal",
          maxAge: 72 * 3600000,
        });
        res.json({ ok: true });
      }),
    );
    app.use("/api/portal", portal);
    app.post("/api/portal/logout", (req, res) => {
      db.prepare("DELETE FROM portal_sessions WHERE hash=?").run(
        req.portal.hash,
      );
      res.clearCookie("ofneeds_supplier", { path: "/api/portal" });
      res.json({ ok: true });
    });
    app.get("/api/portal/workspace", (req, res) => {
      const scope = req.portal,
        record = base(scope.workspace, "vendors", scope.vendor_id),
        data = allData(scope.workspace),
        ops = operations(scope.workspace);
      res.json({
        vendor: record,
        contacts: data.contacts.filter((c) => c.vendorId === scope.vendor_id),
        products: data.products
          .filter((p) => p.quotes?.some((q) => q.vendorId === scope.vendor_id))
          .map((p) => ({
            ...p,
            quotes: p.quotes.filter((q) => q.vendorId === scope.vendor_id),
          })),
        rfqs: data.rfqs
          .filter((r) => r.vendorIds?.includes(scope.vendor_id))
          .map((r) => ({
            ...r,
            vendorIds: [scope.vendor_id],
            responses: (r.responses || []).filter(
              (q) => q.vendorId === scope.vendor_id,
            ),
          })),
        orders: ops.orders.filter(
          (o) =>
            o.vendorId === scope.vendor_id &&
            !["Draft", "Pending approval", "Approved"].includes(o.status),
        ),
        documents: data.documents.filter(
          (d) => d.vendorId === scope.vendor_id && d.uploadedBySupplier,
        ),
        workspaceName: db
          .prepare("SELECT name FROM workspaces WHERE id=?")
          .get(scope.workspace)?.name,
      });
    });
    app.post(
      "/api/portal/profile",
      wrap((req, res) => {
        const scope = req.portal,
          vendor = base(scope.workspace, "vendors", scope.vendor_id),
          value = validateRecord("vendors", {
            ...vendor,
            name: req.body.name,
            contact: req.body.contact,
            email: req.body.email,
            phone: req.body.phone,
            city: req.body.city,
            state: req.body.state,
            address: req.body.address,
          });
        res.status(201).json(
          requestApproval(
            { id: `supplier:${scope.vendor_id}`, workspace: scope.workspace },
            "vendor-profile",
            vendor,
            {
              name: value.name,
              contact: value.contact || "",
              email: value.email || "",
              phone: value.phone || "",
              city: value.city,
              state: value.state || "",
              address: value.address || "",
            },
          ),
        );
      }),
    );
    app.post(
      "/api/portal/rfqs/:id/respond",
      wrap((req, res) => {
        const scope = req.portal,
          rfq = base(scope.workspace, "rfqs", req.params.id);
        if (!rfq.vendorIds.includes(scope.vendor_id) || rfq.status === "Closed")
          throw fail("This RFQ is not open to this supplier.", 403);
        if (
          rfq.deadline &&
          rfq.deadline < new Date().toISOString().slice(0, 10)
        )
          throw fail("The response deadline has passed.", 409);
        const quote = {
          ...req.body,
          vendorId: scope.vendor_id,
          confirmedAt: new Date().toISOString(),
        };
        const value = validateRecord("rfqs", {
          ...rfq,
          responses: [
            ...(rfq.responses || []).filter(
              (q) => q.vendorId !== scope.vendor_id,
            ),
            quote,
          ],
          status: "Quoted",
        });
        updateBase(
          { id: `supplier:${scope.vendor_id}`, workspace: scope.workspace },
          "rfqs",
          { ...rfq, ...value },
          rfq,
        );
        res.json({ ok: true });
      }),
    );
    app.post(
      "/api/portal/products/:id/stock",
      wrap((req, res) => {
        const scope = req.portal,
          product = base(scope.workspace, "products", req.params.id),
          old = product.quotes?.find((q) => q.vendorId === scope.vendor_id);
        if (!old)
          throw fail("This product is not assigned to this supplier.", 403);
        const value = validateRecord("products", {
          ...product,
          quotes: product.quotes.map((q) =>
            q.vendorId === scope.vendor_id
              ? {
                  ...q,
                  price: req.body.price,
                  stock: req.body.stock,
                  moq: req.body.moq,
                  leadTime: req.body.leadTime,
                  confirmedAt: new Date().toISOString(),
                  validUntil: req.body.validUntil || "",
                }
              : q,
          ),
        });
        updateBase(
          { id: `supplier:${scope.vendor_id}`, workspace: scope.workspace },
          "products",
          { ...product, ...value },
          product,
        );
        res.json({ ok: true });
      }),
    );
    app.post(
      "/api/portal/documents",
      wrap(async (req, res) => {
        const scope = req.portal,
          user = {
            id: `supplier:${scope.vendor_id}`,
            workspace: scope.workspace,
          };
        await app.locals.scanUpload(req, user);
        const value = validateRecord("documents", {
            name: req.body.name,
            vendorId: scope.vendor_id,
            description: "Supplier-uploaded catalogue",
          }),
          row = {
            ...value,
            id: randomUUID(),
            uploadedBySupplier: true,
            createdAt: new Date().toISOString(),
          };
        transaction(db, () => {
          db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(
            row.id,
            scope.workspace,
            "documents",
            row.name,
            JSON.stringify(row),
            row.createdAt,
          );
          db.prepare("INSERT INTO files VALUES(?,?,?,?)").run(
            row.id,
            scope.workspace,
            Buffer.from(req.body.base64, "base64"),
            req.body.mime,
          );
          audit(
            db,
            user,
            "supplier catalogue uploaded",
            "documents",
            row.id,
            null,
            { name: row.name },
          );
        });
        res.status(201).json(row);
      }),
    );
    app.get(
      "/api/portal/documents/:id/file",
      wrap((req, res) => {
        const scope = req.portal,
          doc = base(scope.workspace, "documents", req.params.id);
        if (doc.vendorId !== scope.vendor_id || !doc.uploadedBySupplier)
          throw fail("Document not available in this supplier portal.", 404);
        const file = db
          .prepare(
            "SELECT content,mime FROM files WHERE workspace=? AND record_id=?",
          )
          .get(scope.workspace, doc.id);
        if (!file) throw fail("Attachment not found.", 404);
        res
          .set({
            "Content-Type": file.mime,
            "Content-Disposition": 'attachment; filename="supplier-catalogue"',
          })
          .send(Buffer.from(file.content));
      }),
    );
    app.post(
      "/api/portal/orders/:id/action",
      wrap((req, res) => {
        const scope = req.portal,
          order = get(scope.workspace, "orders", req.params.id);
        if (order.vendorId !== scope.vendor_id)
          throw fail("Order not found.", 404);
        const action = req.body.action,
          next = { ...order };
        if (action === "accept" || action === "decline") {
          if (order.status !== "Issued")
            throw fail("Only issued orders can be accepted or declined.", 409);
          next.status = action === "accept" ? "Accepted" : "Declined";
        } else if (action === "dispatch") {
          if (order.status !== "Accepted")
            throw fail("Accept the order before recording dispatch.", 409);
          if (!String(req.body.reference || "").trim())
            throw fail("Enter a dispatch reference.");
          next.status = "Dispatched";
          next.dispatchReference = String(req.body.reference).slice(0, 100);
          next.dispatchedAt = new Date().toISOString();
        } else throw fail("Unknown supplier action.");
        res.json(
          put(
            { id: `supplier:${scope.vendor_id}`, workspace: scope.workspace },
            "orders",
            next,
            order,
          ),
        );
      }),
    );
  }
  return {
    operations,
    base,
    get,
    put,
    updateBase,
    config,
    limits,
    metadata,
    setMetadata,
    requestApproval,
  };
}
