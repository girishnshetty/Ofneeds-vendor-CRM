import test from "node:test";
import assert from "node:assert/strict";
import { canDelete } from "../shared/core.mjs";
import { openStore } from "../server/store.mjs";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  demoData,
  emptyData,
  metrics,
  paginate,
  validateRecord,
  validateLinks,
  csv,
} from "../shared/core.mjs";
test("fictional dataset has the requested record counts and isolated instances", () => {
  const a = demoData(),
    b = demoData();
  assert.deepEqual(
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.length])),
    {
      vendors: 25,
      brands: 15,
      contacts: 50,
      products: 40,
      rfqs: 8,
      "follow-ups": 15,
      documents: 1,
    },
  );
  a.vendors[0].name = "Changed";
  assert.notEqual(a.vendors[0].name, b.vendors[0].name);
  for (const row of b.vendors) {
    assert.equal(row.sample, true);
    assert.match(row.email, /@supplier\.example$/);
    assert.match(row.phone, /Not dialable/);
  }
  for (const row of b.contacts) assert.match(row.email, /@supplier\.example$/);
});
test("metrics use actual records, do not invent growth, and exclude expired authorizations", () => {
  const data = emptyData();
  assert.equal(metrics(data).vendors, 0);
  data.vendors.push({
    id: "v",
    name: "V",
    status: "Active",
    authorization: "Authorized",
    authorizationUntil: "2020-01-01",
  });
  assert.equal(metrics(data).authorized, 0);
  assert.equal(metrics(data).active, 1);
  assert.equal("growth" in metrics(data), false);
});
test("pagination combines filters, sorting and bounded page sizes", () => {
  const data = demoData();
  const page = paginate(data.vendors, { city: "Bengaluru", limit: 2, page: 2 });
  assert.equal(page.rows.length, 2);
  assert.ok(page.rows.every((v) => v.city === "Bengaluru"));
  assert.equal(page.total, 5);
  assert.equal(
    paginate(data.vendors, { q: "no such supplier" }).rows.length,
    0,
  );
  assert.equal(paginate(data.vendors, { brandId: "brand-1" }).total, 3);
});
test("record validation rejects invalid input and strips privilege fields", () => {
  assert.throws(() => validateRecord("users", { name: "X" }));
  assert.throws(() => validateRecord("vendors", { name: "X" }), /city/);
  assert.throws(
    () =>
      validateRecord("vendors", {
        name: "X",
        city: "Bengaluru",
        email: "invalid",
      }),
    /email/,
  );
  const row = validateRecord("vendors", {
    name: "  Sample Co  ",
    city: "Bengaluru",
    workspace: "other",
    id: "attacker",
    sample: false,
  });
  assert.equal(row.name, "Sample Co");
  assert.equal(row.workspace, undefined);
  assert.equal(row.id, undefined);
  assert.equal(row.sample, undefined);
});
test("RFQ quantities, supplier selections, tasks and prices are validated", () => {
  assert.throws(() =>
    validateRecord("rfqs", { name: "Test", quantity: -1, vendorIds: ["v"] }),
  );
  assert.throws(() =>
    validateRecord("rfqs", { name: "Test", quantity: 5, vendorIds: [] }),
  );
  assert.throws(() =>
    validateRecord("follow-ups", {
      name: "Call",
      vendorId: "v",
      date: "not-a-date",
      status: "Open",
    }),
  );
  assert.throws(() =>
    validateRecord("products", {
      name: "Mug",
      quotes: [{ vendorId: "v", price: 0, moq: 1, stock: 0, leadTime: 3 }],
    }),
  );
});
test("references must resolve within the supplied workspace", () => {
  const data = demoData();
  assert.throws(() =>
    validateLinks("contacts", { vendorId: "foreign-workspace-id" }, data),
  );
  assert.throws(() =>
    validateLinks("products", { quotes: [{ vendorId: "foreign" }] }, data),
  );
  assert.doesNotThrow(() =>
    validateLinks("vendors", { brandIds: ["brand-1"] }, data),
  );
});
test("CSV export protects formula injection and preserves quotes and line breaks", () => {
  const output = csv(
    [{ name: '=HYPERLINK("evil")', city: "Bengaluru\nNorth" }],
    ["name", "city"],
  );
  assert.ok(output.includes('"\'=HYPERLINK(""evil"")"'));
  assert.ok(output.includes('"Bengaluru\nNorth"'));
});
test("RFQ responses reject unrelated suppliers, duplicates and invalid commercial terms", () => {
  const value = {
    name: "Sample sourcing",
    quantity: 100,
    productId: "p",
    vendorIds: ["v"],
    responses: [
      { vendorId: "v", price: 100, moq: 10, stock: 500, leadTime: 4 },
    ],
  };
  assert.equal(validateRecord("rfqs", value).responses[0].price, 100);
  assert.throws(() =>
    validateRecord("rfqs", {
      ...value,
      responses: [{ ...value.responses[0], vendorId: "other" }],
    }),
  );
  assert.throws(() =>
    validateRecord("rfqs", {
      ...value,
      responses: [...value.responses, ...value.responses],
    }),
  );
  assert.throws(() =>
    validateRecord("rfqs", {
      ...value,
      responses: [{ ...value.responses[0], stock: -1 }],
    }),
  );
});
test("demo delete protection preserves related supplier and procurement history", () => {
  const data = demoData();
  assert.throws(() => canDelete(data, "vendors", "vendor-1"));
  assert.throws(() => canDelete(data, "brands", "brand-1"));
  assert.throws(() => canDelete(data, "products", "product-1"));
  assert.doesNotThrow(() => canDelete(data, "contacts", "contact-1"));
});
test("SQLite records and preferences survive closing and reopening the database", () => {
  mkdirSync(resolve("test-results"), { recursive: true });
  const folder = mkdtempSync(resolve("test-results/store-")),
    path = join(folder, "crm.sqlite");
  let db = openStore(path);
  db.prepare("INSERT INTO workspaces(id,name) VALUES(?,?)").run(
    "workspace",
    "Persistence test",
  );
  db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?)").run(
    "v",
    "workspace",
    "vendors",
    "Durable supplier",
    JSON.stringify({ id: "v", name: "Durable supplier", city: "Bengaluru" }),
    new Date().toISOString(),
  );
  db.close();
  db = openStore(path);
  assert.equal(
    db
      .prepare("SELECT count(*) n FROM records WHERE workspace=?")
      .get("workspace").n,
    1,
  );
  assert.equal(
    db.prepare("SELECT name FROM records WHERE id=?").get("v").name,
    "Durable supplier",
  );
  db.close();
});
