import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";
import {
  totp,
  base32,
  counterFor,
  vault,
  audit,
  auditValid,
  migrateSecurity,
} from "../server/security.mjs";
import { createBackup, restoreBackup } from "../server/backups.mjs";
import {
  landedCost,
  orderTotals,
  receiveOrder,
  validateOperation,
  performance,
} from "../shared/operations.mjs";
import { parseCsv, mapImport } from "../shared/import.mjs";

test("authenticator matches RFC vectors, rejects replay and malformed codes", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  assert.equal(totp(secret, 59000), "287082");
  assert.equal(totp(secret, 1111111109000), "081804");
  assert.equal(counterFor(secret, "287082", -1, 59000), 1);
  assert.equal(counterFor(secret, "287082", 1, 59000), null);
  assert.equal(counterFor(secret, "bad", -1, 59000), null);
});
test("landed totals, receipts, and performance use recorded observations", () => {
  assert.deepEqual(
    landedCost(
      { price: 10.01, customization: 2, packaging: 1, freight: 5, taxRate: 18 },
      3,
    ),
    {
      product: 3003,
      customization: 600,
      packaging: 300,
      freight: 500,
      subtotal: 4403,
      tax: 793,
      total: 5196,
      currency: "INR",
    },
  );
  assert.throws(() => landedCost({ price: -1 }, 1));
  assert.throws(() => landedCost({ price: 1 }, 1.5));
  assert.throws(
    () =>
      orderTotals([
        { price: 90000000, quantity: 1000000 },
        { price: 90000000, quantity: 1000000 },
      ]),
    /precision/,
  );
  const order = {
    status: "Accepted",
    lines: [{ id: "a", quantity: 5 }],
    received: {},
  };
  assert.equal(
    receiveOrder(order, [{ lineId: "a", quantity: 2 }]).status,
    "Partially received",
  );
  assert.throws(() => receiveOrder(order, [{ lineId: "a", quantity: 6 }]));
  assert.throws(() =>
    validateOperation("orders", {
      name: "Bad",
      vendorId: "v",
      lines: [
        { id: "x", productId: "p", quantity: 1, price: 1 },
        { id: "x", productId: "p", quantity: 1, price: 2 },
      ],
    }),
  );
  assert.equal(performance([], [], "v").onTimePercent, null);
});
test("mapped import handles quoted newlines and requires identity columns", () => {
  const parsed = parseCsv(
    'Company,Location,Note\r\n"Acme, Ltd",Pune,"Line 1\nLine 2"',
  );
  assert.equal(parsed[1][0], "Acme, Ltd");
  const mapped = mapImport(parsed, { name: 0, city: 1 });
  assert.equal(mapped[0].name, "Acme, Ltd");
  assert.throws(() => parseCsv('a,b\n"unfinished'));
  assert.throws(() => mapImport(parsed, { name: 0 }));
});
test("encrypted backup restores into a new directory, rejects tampering and revokes access", async () => {
  mkdirSync(resolve("test-results"), { recursive: true });
  const dir = mkdtempSync(resolve("test-results/backup-test-"));
  const db = new DatabaseSync(join(dir, "crm.sqlite"));
  db.exec(
    "CREATE TABLE sessions(token TEXT); CREATE TABLE session_info(token TEXT); CREATE TABLE example(value TEXT); INSERT INTO sessions VALUES('secret'); INSERT INTO example VALUES('persistent');",
  );
  const secure = vault(dir),
    saved = await createBackup(db, dir, secure);
  db.close();
  assert.ok(!readFileSync(saved.path, "utf8").includes("persistent"));
  const restored = await restoreBackup(
    saved.path,
    join(dir, "restored"),
    secure,
    dir,
  );
  const copy = new DatabaseSync(restored.path);
  assert.equal(
    copy.prepare("SELECT value FROM example").get().value,
    "persistent",
  );
  assert.equal(copy.prepare("SELECT count(*) n FROM sessions").get().n, 0);
  copy.close();
  await assert.rejects(
    restoreBackup(saved.path, join(dir, "restored"), secure, dir),
    /new or empty/,
  );
  const corrupt = JSON.parse(readFileSync(saved.path, "utf8"));
  corrupt.checksum = "0".repeat(64);
  const bad = join(dir, "bad.crmbackup");
  writeFileSync(bad, JSON.stringify(corrupt));
  await assert.rejects(
    restoreBackup(bad, join(dir, "bad-restore"), secure, dir),
    /integrity/,
  );
  const memory = new DatabaseSync(":memory:");
  memory.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY);CREATE TABLE sessions(token TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);",
  );
  migrateSecurity(memory);
  audit(
    memory,
    { id: "owner", workspace: "w" },
    "created",
    "vendor",
    "1",
    null,
    { name: "Original" },
  );
  const entries = memory
    .prepare("SELECT * FROM audit_events ORDER BY seq")
    .all();
  assert.equal(auditValid(entries), true);
  entries[0].action = "forged";
  assert.equal(auditValid(entries), false);
  assert.throws(() => memory.exec("DELETE FROM audit_events"), /append.only/i);
  memory.close();
});

test("enterprise API workflows and security isolation", async (t) => {
  mkdirSync(resolve("test-results"), { recursive: true });
  const dir = mkdtempSync(resolve("test-results/enterprise-api-")),
    port = 4325,
    base = `http://127.0.0.1:${port}`,
    password = "Local-testing-12345";
  const child = spawn(process.execPath, ["server/index.mjs", "--api-test"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      APP_URL: base,
      CRM_DATA_DIR: dir,
      CRM_AUTOMATION_INTERVAL_SECONDS: "0",
      CRM_BACKUP_INTERVAL_HOURS: "0",
      CRM_BILLING_WEBHOOK_SECRET: "test-billing-secret",
      CRM_BILLING_CATALOG_JSON: JSON.stringify({
        team: { amountPaise: 10000 },
      }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  t.after(() => child.kill());
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (i === 79) throw Error(output);
    await delay(150);
  }
  async function request(path, method = "GET", body, cookie = "", extra = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return {
      status: response.status,
      json,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const signup = await request("/api/auth/signup", "POST", {
    name: "Workflow Owner",
    company: "Workflow QA",
    email: "workflow@example.test",
    password,
  });
  assert.equal(signup.status, 201, JSON.stringify(signup));
  const owner = signup.cookie;
  const other = (
    await request("/api/auth/signup", "POST", {
      name: "Other Owner",
      company: "Other QA",
      email: "other-workflow@example.test",
      password,
    })
  ).cookie;
  const vendor = (
    await request(
      "/api/crm/vendors",
      "POST",
      {
        name: "Workflow Supplier",
        city: "Pune",
        email: "supplier@example.test",
        authorization: "Unverified",
        status: "Active",
      },
      owner,
    )
  ).json;
  const competitor = (
    await request(
      "/api/crm/vendors",
      "POST",
      {
        name: "Other Supplier",
        email: "other-supplier@example.test",
        city: "Delhi",
        authorization: "Unverified",
        status: "Active",
      },
      owner,
    )
  ).json;
  const product = (
    await request(
      "/api/crm/products",
      "POST",
      {
        name: "Gift Box",
        category: "Gifts",
        quotes: [
          { vendorId: vendor.id, price: 100, moq: 1, stock: 100, leadTime: 2 },
          {
            vendorId: competitor.id,
            price: 80,
            moq: 1,
            stock: 100,
            leadTime: 3,
          },
        ],
      },
      owner,
    )
  ).json;
  assert.ok(product.id, JSON.stringify(product));
  const rfq = (
    await request(
      "/api/crm/rfqs",
      "POST",
      {
        name: "Festival gifts",
        productId: product.id,
        quantity: 10,
        vendorIds: [vendor.id, competitor.id],
        deadline: "2099-01-01",
        status: "Open",
        responses: [
          { vendorId: vendor.id, price: 100, stock: 100, moq: 1, leadTime: 2 },
          {
            vendorId: competitor.id,
            price: 80,
            stock: 100,
            moq: 1,
            leadTime: 3,
          },
        ],
      },
      owner,
    )
  ).json;
  assert.ok(rfq.id, JSON.stringify(rfq));
  let member, portal, portalGrant;
  await t.test(
    "invitations bind role and identity; viewers cannot write",
    async () => {
      const invite = await request(
        "/api/security/invitations",
        "POST",
        { email: "viewer@example.test", role: "viewer", password },
        owner,
      );
      assert.equal(invite.status, 201, JSON.stringify(invite));
      const token = new URL(invite.json.invitationLink).searchParams.get(
        "token",
      );
      const accepted = await request("/api/auth/accept-invitation", "POST", {
        token,
        name: "View Only",
        password,
      });
      assert.equal(accepted.status, 201, JSON.stringify(accepted));
      member = accepted.cookie;
      assert.equal(accepted.json.user.role, "viewer");
      assert.equal(
        (
          await request("/api/auth/accept-invitation", "POST", {
            token,
            name: "Again",
            password,
          })
        ).status,
        410,
      );
      assert.equal(
        (
          await request(
            "/api/ops/records/projects",
            "POST",
            { name: "Forbidden" },
            member,
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/api/ops/records/projects", "GET", undefined, other))
          .json.total,
        0,
      );
    },
  );
  await t.test(
    "supplier portal limits data, hides competing prices and revokes one-use sessions",
    async () => {
      const invite = await request(
        "/api/ops/portal/invite",
        "POST",
        { vendorId: vendor.id, password },
        owner,
      );
      assert.equal(invite.status, 201, JSON.stringify(invite));
      const token = new URL(invite.json.link).searchParams.get("token");
      const exchange = await request("/api/portal/exchange", "POST", { token });
      assert.equal(exchange.status, 200);
      portal = exchange.cookie;
      portalGrant = (
        await request("/api/ops/overview", "GET", undefined, owner)
      ).json.portalLinks[0].id;
      assert.equal(
        (await request("/api/portal/exchange", "POST", { token })).status,
        410,
      );
      const data = await request(
        "/api/portal/workspace",
        "GET",
        undefined,
        portal,
      );
      assert.equal(data.status, 200);
      assert.equal(data.json.products[0].quotes.length, 1);
      assert.equal(data.json.rfqs[0].responses.length, 1);
      assert.equal(data.json.rfqs[0].vendorIds.length, 1);
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, portal)).status,
        401,
      );
      assert.equal(
        (
          await request(
            "/api/portal/products/" + product.id + "/stock",
            "POST",
            { price: 110, stock: 120, moq: 1, leadTime: 2 },
            portal,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/api/ops/records/projects", "GET", undefined, portal))
          .status,
        401,
      );
    },
  );
  let order;
  await t.test(
    "orders require owner approval and enforce exact partial-receipt quantities",
    async () => {
      const created = await request(
        "/api/ops/records/orders",
        "POST",
        {
          name: "Gift order",
          vendorId: vendor.id,
          dueDate: "2099-01-01",
          lines: [
            {
              id: "line1",
              productId: product.id,
              quantity: 10,
              price: 100,
              customization: 5,
              freight: 20,
              taxRate: 18,
            },
          ],
        },
        owner,
      );
      assert.equal(created.status, 201, JSON.stringify(created));
      order = created.json;
      assert.equal(
        (
          await request(
            "/api/ops/orders/" + order.id + "/action",
            "POST",
            { action: "issue" },
            owner,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "/api/ops/orders/" + order.id + "/submit",
            "POST",
            {},
            owner,
          )
        ).status,
        200,
      );
      const approvals = (
        await request("/api/ops/approvals", "GET", undefined, owner)
      ).json;
      assert.equal(
        (
          await request(
            "/api/ops/approvals/" + approvals[0].id + "/decide",
            "POST",
            { decision: "Approved", reason: "Budget confirmed" },
            member,
          )
        ).status,
        403,
      );
      const decision = await request(
        "/api/ops/approvals/" + approvals[0].id + "/decide",
        "POST",
        { decision: "Approved", reason: "Budget confirmed" },
        owner,
      );
      assert.equal(decision.status, 200, JSON.stringify(decision));
      assert.equal(
        (
          await request(
            "/api/ops/orders/" + order.id + "/action",
            "POST",
            { action: "issue" },
            owner,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/portal/orders/" + order.id + "/action",
            "POST",
            { action: "accept" },
            portal,
          )
        ).status,
        200,
      );
      let result = await request(
        "/api/ops/orders/" + order.id + "/action",
        "POST",
        {
          action: "receive",
          reference: "GRN1",
          lines: [{ lineId: "line1", quantity: 4 }],
        },
        owner,
      );
      assert.equal(result.status, 200, JSON.stringify(result));
      assert.equal(result.json.status, "Partially received");
      result = await request(
        "/api/ops/orders/" + order.id + "/action",
        "POST",
        {
          action: "receive",
          reference: "GRN1",
          lines: [{ lineId: "line1", quantity: 4 }],
        },
        owner,
      );
      assert.equal(result.json.received.line1, 4);
      assert.equal(
        (
          await request(
            "/api/ops/orders/" + order.id + "/action",
            "POST",
            {
              action: "receive",
              reference: "GRN2",
              lines: [{ lineId: "line1", quantity: 7 }],
            },
            owner,
          )
        ).status,
        400,
      );
      result = await request(
        "/api/ops/orders/" + order.id + "/action",
        "POST",
        {
          action: "receive",
          reference: "GRN3",
          lines: [{ lineId: "line1", quantity: 6 }],
        },
        owner,
      );
      assert.equal(result.json.status, "Completed");
      assert.equal(
        (
          await request(
            "/api/ops/orders/" + order.id + "/action",
            "POST",
            { action: "cancel", reason: "No" },
            owner,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "vendor authorization requires actual evidence and approved review",
    async () => {
      assert.equal(
        (
          await request(
            "/api/crm/vendors/" + vendor.id,
            "PATCH",
            { ...vendor, authorization: "Authorized" },
            owner,
          )
        ).status,
        409,
      );
      const doc = (
        await request(
          "/api/crm/documents",
          "POST",
          { name: "Authorization evidence", vendorId: vendor.id },
          owner,
        )
      ).json;
      assert.ok(doc.id);
      assert.equal(
        (
          await request(
            "/api/ops/vendors/" + vendor.id + "/review-request",
            "POST",
            { authorization: "Authorized", documentId: doc.id },
            owner,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/api/crm/documents/" + doc.id + "/file",
            "POST",
            {
              mime: "image/png",
              base64: Buffer.from("fake image").toString("base64"),
            },
            owner,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/api/crm/documents/" + doc.id + "/file",
            "POST",
            {
              mime: "text/plain",
              base64: Buffer.from("QA authorization evidence").toString(
                "base64",
              ),
            },
            owner,
          )
        ).status,
        200,
      );
      const approval = await request(
        "/api/ops/vendors/" + vendor.id + "/review-request",
        "POST",
        {
          authorization: "Authorized",
          documentId: doc.id,
          reason: "Evidence checked",
        },
        owner,
      );
      assert.equal(approval.status, 201, JSON.stringify(approval));
      assert.equal(
        (
          await request(
            "/api/ops/approvals/" + approval.json.id + "/decide",
            "POST",
            { decision: "Approved", reason: "Evidence accepted" },
            owner,
          )
        ).status,
        200,
      );
      const data = (
        await request("/api/portal/workspace", "GET", undefined, portal)
      ).json;
      assert.equal(
        data.documents.length,
        0,
        "internal evidence is never exposed in supplier portal",
      );
    },
  );

  await t.test(
    "reviewed evidence cannot be replaced or deleted and authorization expiry cannot bypass review",
    async () => {
      const docs = (
        await request("/api/crm/documents?limit=100", "GET", undefined, owner)
      ).json.rows;
      const doc = docs.find((d) => d.name === "Authorization evidence");
      assert.equal(
        (
          await request(
            "/api/crm/documents/" + doc.id + "/file",
            "POST",
            {
              mime: "text/plain",
              base64: Buffer.from("Replaced evidence").toString("base64"),
            },
            owner,
          )
        ).status,
        409,
      );
      assert.equal(
        (await request("/api/crm/documents/" + doc.id, "DELETE", {}, owner))
          .status,
        409,
      );
      const current = (
        await request("/api/crm/vendors/" + vendor.id, "GET", undefined, owner)
      ).json;
      assert.equal(
        (
          await request(
            "/api/crm/vendors/" + vendor.id,
            "PATCH",
            { ...current, authorizationUntil: "2099-01-01" },
            owner,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "quotation awards reject stale versions and convert an approved response once",
    async () => {
      const award = await request(
        "/api/ops/rfqs/" + rfq.id + "/award",
        "POST",
        { vendorId: vendor.id },
        owner,
      );
      assert.equal(award.status, 201, JSON.stringify(award));
      const current = (
        await request("/api/crm/rfqs/" + rfq.id, "GET", undefined, owner)
      ).json;
      assert.equal(
        (
          await request(
            "/api/crm/rfqs/" + rfq.id,
            "PATCH",
            { ...current, name: "Revised festival gifts" },
            owner,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/ops/approvals/" + award.json.id + "/decide",
            "POST",
            { decision: "Approved", reason: "Stale review" },
            owner,
          )
        ).status,
        409,
      );
      await request(
        "/api/ops/approvals/" + award.json.id + "/decide",
        "POST",
        { decision: "Rejected", reason: "Record revised" },
        owner,
      );
      const fresh = await request(
        "/api/ops/rfqs/" + rfq.id + "/award",
        "POST",
        { vendorId: vendor.id },
        owner,
      );
      assert.equal(fresh.status, 201);
      assert.equal(
        (
          await request(
            "/api/ops/approvals/" + fresh.json.id + "/decide",
            "POST",
            { decision: "Approved", reason: "Fresh terms confirmed" },
            owner,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/ops/rfqs/" + rfq.id + "/create-order",
            "POST",
            {},
            owner,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "/api/ops/rfqs/" + rfq.id + "/create-order",
            "POST",
            {},
            owner,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "supplier catalogues are scoped and portal grants can be revoked immediately",
    async () => {
      const uploaded = await request(
        "/api/portal/documents",
        "POST",
        {
          name: "Supplier catalogue",
          mime: "text/plain",
          base64: Buffer.from("Supplier catalogue content").toString("base64"),
        },
        portal,
      );
      assert.equal(uploaded.status, 201, JSON.stringify(uploaded));
      assert.equal(
        (await request("/api/portal/workspace", "GET", undefined, portal)).json
          .documents.length,
        1,
      );
      assert.equal(
        (
          await request(
            "/api/crm/documents/" + uploaded.json.id + "/file",
            "GET",
            undefined,
            other,
          )
        ).status,
        404,
      );
      assert.equal(
        (await request("/api/ops/portal/" + portalGrant, "DELETE", {}, owner))
          .status,
        200,
      );
      assert.equal(
        (await request("/api/portal/workspace", "GET", undefined, portal))
          .status,
        401,
      );
    },
  );
  await t.test(
    "scheduled reports are private, generated once, and never marked delivered without a provider",
    async () => {
      const schedule = await request(
        "/api/ops/records/report-schedules",
        "POST",
        {
          name: "Weekly supplier report",
          report: "network",
          recipient: "report@example.test",
          frequencyDays: 7,
          nextDate: "2020-01-01",
          enabled: true,
        },
        owner,
      );
      assert.equal(schedule.status, 201, JSON.stringify(schedule));
      await request("/api/services/process-jobs", "POST", {}, owner);
      await request("/api/services/process-jobs", "POST", {}, owner);
      const snapshots = (
        await request("/api/services/report-snapshots", "GET", undefined, owner)
      ).json;
      assert.equal(snapshots.length, 1);
      const csv = await request(
        "/api/services/report-snapshots/" + snapshots[0].id,
        "GET",
        undefined,
        owner,
      );
      assert.equal(csv.status, 200);
      assert.match(csv.json, /Workflow Supplier/);
      assert.equal(
        (
          await request(
            "/api/services/report-snapshots/" + snapshots[0].id,
            "GET",
            undefined,
            other,
          )
        ).status,
        404,
      );
    },
  );
  await t.test(
    "scheduled work is idempotent, scoped keys are revocable, delivery stays blocked",
    async () => {
      const rule = await request(
        "/api/ops/records/automations",
        "POST",
        {
          name: "Repeat stock check",
          vendorId: vendor.id,
          frequencyDays: 7,
          nextDate: "2020-01-01",
          enabled: true,
        },
        owner,
      );
      assert.equal(rule.status, 201, JSON.stringify(rule));
      await request("/api/services/process-jobs", "POST", {}, owner);
      await request("/api/services/process-jobs", "POST", {}, owner);
      const tasks = (
        await request("/api/crm/follow-ups?limit=100", "GET", undefined, owner)
      ).json.rows;
      assert.equal(
        tasks.filter((r) => r.automationId === rule.json.id).length,
        1,
      );
      assert.ok(
        (await request("/api/services/notifications", "GET", undefined, owner))
          .json.length,
      );
      const key = await request(
        "/api/services/api-keys",
        "POST",
        {
          name: "Vendor reporting",
          scopes: ["vendors:read"],
          days: 7,
          password,
        },
        owner,
      );
      assert.equal(key.status, 201, JSON.stringify(key));
      assert.equal(
        (
          await request(
            "/api/integrations/records/vendors",
            "GET",
            undefined,
            "",
            { Authorization: "Bearer " + key.json.key },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/integrations/records/products",
            "GET",
            undefined,
            "",
            { Authorization: "Bearer " + key.json.key },
          )
        ).status,
        403,
      );
      await request(
        "/api/services/api-keys/" + key.json.id,
        "DELETE",
        {},
        owner,
      );
      assert.equal(
        (
          await request(
            "/api/integrations/records/vendors",
            "GET",
            undefined,
            "",
            { Authorization: "Bearer " + key.json.key },
          )
        ).status,
        403,
      );
      const queue = await request(
        "/api/ops/rfqs/" + rfq.id + "/queue",
        "POST",
        { channel: "email" },
        owner,
      );
      assert.equal(queue.status, 200, JSON.stringify(queue));
      const outbox = (await request("/api/ops/outbox", "GET", undefined, owner))
        .json;
      assert.ok(outbox.every((r) => r.status === "blocked"));
      assert.equal(
        (await request("/api/ops/audit", "GET", undefined, owner)).json.valid,
        true,
      );
    },
  );
  await t.test(
    "billing rejects invalid signatures and amounts; paid events are idempotent",
    async () => {
      const plan = await request(
        "/api/services/billing/request",
        "POST",
        { plan: "team" },
        owner,
      );
      assert.equal(plan.status, 201);
      const body = {
        eventId: "qa-paid-1",
        requestId: plan.json.id,
        status: "paid",
        amountPaise: 999,
        currency: "INR",
        termEnd: "2099-01-01",
        reference: "mock-payment",
      };
      const signed = (b) => ({
        "x-ofneeds-signature": createHmac("sha256", "test-billing-secret")
          .update(JSON.stringify(b))
          .digest("hex"),
      });
      assert.equal(
        (await request("/api/billing/webhook", "POST", body)).status,
        401,
      );
      assert.equal(
        (await request("/api/billing/webhook", "POST", body, "", signed(body)))
          .status,
        400,
      );
      body.amountPaise = 10000;
      assert.equal(
        (await request("/api/billing/webhook", "POST", body, "", signed(body)))
          .status,
        200,
      );
      assert.equal(
        (await request("/api/billing/webhook", "POST", body, "", signed(body)))
          .json.duplicate,
        true,
      );
      assert.equal(
        (await request("/api/services/billing", "GET", undefined, owner)).json
          .limits.plan,
        "team",
      );
    },
  );
  await t.test(
    "MFA blocks password-only login, consumes recovery codes, and cannot be replayed",
    async () => {
      const enroll = await request(
        "/api/security/mfa/enroll",
        "POST",
        { password },
        owner,
      );
      assert.equal(enroll.status, 200, JSON.stringify(enroll));
      const enabled = await request(
        "/api/security/mfa/confirm",
        "POST",
        { code: totp(enroll.json.secret) },
        owner,
      );
      assert.equal(enabled.status, 200, JSON.stringify(enabled));
      assert.equal(enabled.json.recoveryCodes.length, 10);
      let login = await request("/api/auth/login", "POST", {
        email: "workflow@example.test",
        password,
      });
      assert.equal(login.json.mfaRequired, true);
      assert.equal(login.cookie, undefined);
      assert.equal(
        (
          await request("/api/auth/mfa", "POST", {
            challenge: login.json.challenge,
            code: totp(enroll.json.secret),
          })
        ).status,
        401,
        "enrollment code cannot be replayed",
      );
      const verified = await request("/api/auth/mfa", "POST", {
        challenge: login.json.challenge,
        code: enabled.json.recoveryCodes[0],
      });
      assert.equal(verified.status, 200);
      assert.ok(verified.cookie);
      assert.equal(
        (
          await request("/api/auth/mfa", "POST", {
            challenge: login.json.challenge,
            code: enabled.json.recoveryCodes[1],
          })
        ).status,
        401,
      );
      login = await request("/api/auth/login", "POST", {
        email: "workflow@example.test",
        password,
      });
      assert.equal(
        (
          await request("/api/auth/mfa", "POST", {
            challenge: login.json.challenge,
            code: enabled.json.recoveryCodes[0],
          })
        ).status,
        401,
      );
      const unknown = await request("/api/auth/forgot-password", "POST", {
          email: "unknown@example.test",
        }),
        known = await request("/api/auth/forgot-password", "POST", {
          email: "workflow@example.test",
        });
      assert.deepEqual(known.json, unknown.json);
      assert.ok(!JSON.stringify(known.json).includes("token="));
      const store = new DatabaseSync(join(dir, "crm.sqlite"));
      const queued = store
        .prepare(
          "SELECT encrypted_body FROM outbox WHERE subject='Reset your OfNeeds Vendor CRM password' ORDER BY created DESC LIMIT 1",
        )
        .get();
      const text = JSON.parse(
        vault(dir).open(queued.encrypted_body).toString(),
      ).text;
      const token = new URL(text.match(/http[^ ]+/)[0]).searchParams.get(
        "token",
      );
      store.close();
      assert.equal(
        (
          await request("/api/auth/reset-password", "POST", {
            token,
            password: "Replacement-test-12345",
          })
        ).status,
        401,
        "MFA remains required during password recovery",
      );
      const reset = await request("/api/auth/reset-password", "POST", {
        token,
        password: "Replacement-test-12345",
        code: enabled.json.recoveryCodes[2],
      });
      assert.equal(reset.status, 200, JSON.stringify(reset));
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, owner)).status,
        401,
      );
      assert.equal(
        (
          await request("/api/auth/reset-password", "POST", {
            token,
            password: "Replacement-test-12345",
            code: enabled.json.recoveryCodes[3],
          })
        ).status,
        410,
      );
    },
  );
});
