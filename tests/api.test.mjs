import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const port = 4319,
  base = `http://127.0.0.1:${port}`;
test("authenticated API: isolation, persistence, references, imports, roles and sessions", async (t) => {
  mkdirSync(resolve("test-results"), { recursive: true });
  const dataDir = mkdtempSync(resolve("test-results/crm-api-"));
  let child = spawn(process.execPath, ["server/index.mjs", "--api-test"], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      APP_URL: base,
      CRM_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (d) => (output += d));
  child.stdout.on("data", (d) => (output += d));
  t.after(() => child.kill());
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (i === 59) throw new Error(output);
    await delay(250);
  }
  const request = async (
    path,
    method = "GET",
    body,
    cookie = "",
    headers = {},
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      json: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  await t.test("public demo does not grant a private API session", async () => {
    assert.equal((await request("/api/crm/vendors")).status, 401);
    assert.equal((await request("/api/auth/me")).json.user, null);
  });
  const alice = await request("/api/auth/signup", "POST", {
    name: "Test Owner",
    company: "Test Workspace A",
    email: "alice@workspace.example",
    password: "Testing-local-12345",
  });
  assert.equal(alice.status, 201);
  const a = alice.cookie;
  const bob = await request("/api/auth/signup", "POST", {
    name: "Other Owner",
    company: "Workspace B",
    email: "bob@workspace.example",
    password: "Testing-local-67890",
  });
  assert.equal(bob.status, 201);
  const b = bob.cookie;
  let vendor, brand, product;
  await t.test("new accounts start with an empty network", async () => {
    const data = await request("/api/crm/summary", "GET", undefined, a);
    assert.equal(data.json.metrics.vendors, 0);
    assert.equal(data.json.metrics.products, 0);
  });
  await t.test(
    "create and read vendor, reject duplicates and foreign reads",
    async () => {
      vendor = (
        await request(
          "/api/crm/vendors",
          "POST",
          {
            name: "Private Test Supplier",
            city: "Bengaluru",
            status: "Active",
            authorization: "Unverified",
          },
          a,
        )
      ).json;
      assert.ok(vendor.id);
      assert.equal(
        (await request(`/api/crm/vendors/${vendor.id}`, "GET", undefined, b))
          .status,
        404,
      );
      assert.equal(
        (
          await request(
            "/api/crm/vendors",
            "POST",
            { name: vendor.name, city: "Mumbai" },
            a,
          )
        ).status,
        409,
      );
      assert.equal(
        (await request("/api/crm/vendors?q=Private", "GET", undefined, a)).json
          .total,
        1,
      );
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, b)).json.total,
        0,
      );
    },
  );
  await t.test("related records cannot reference another tenant", async () => {
    assert.equal(
      (
        await request(
          "/api/crm/contacts",
          "POST",
          { name: "Contact", vendorId: vendor.id },
          b,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/api/crm/vendors/${vendor.id}`,
          "PATCH",
          { name: "Attack", city: "Pune" },
          b,
        )
      ).status,
      404,
    );
    assert.equal(
      (await request("/api/crm/search?q=Private", "GET", undefined, b)).json
        .length,
      0,
    );
  });
  await t.test(
    "brands, prices and RFQ relationships save correctly",
    async () => {
      brand = (
        await request(
          "/api/crm/brands",
          "POST",
          { name: "Test Brand", category: "Drinkware" },
          a,
        )
      ).json;
      product = (
        await request(
          "/api/crm/products",
          "POST",
          {
            name: "Test Mug",
            brandId: brand.id,
            quotes: [
              {
                vendorId: vendor.id,
                price: 250,
                moq: 10,
                stock: 500,
                leadTime: 4,
              },
            ],
          },
          a,
        )
      ).json;
      assert.ok(product.id);
      assert.equal(
        (
          await request(
            "/api/crm/rfqs",
            "POST",
            {
              name: "Welcome kits",
              productId: product.id,
              quantity: 50,
              vendorIds: [vendor.id],
              status: "Open",
            },
            a,
          )
        ).status,
        201,
      );
      assert.equal(
        (await request(`/api/crm/brands/${brand.id}`, "DELETE", {}, a)).status,
        409,
      );
      assert.equal(
        (await request(`/api/crm/vendors/${vendor.id}`, "DELETE", {}, a))
          .status,
        409,
      );
    },
  );
  await t.test(
    "brand search and linked supplier queries are tenant scoped",
    async () => {
      assert.equal(
        (
          await request(
            `/api/crm/vendors/${vendor.id}`,
            "PATCH",
            { ...vendor, brandIds: [brand.id] },
            a,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/api/crm/vendors?q=Test%20Brand", "GET", undefined, a))
          .json.total,
        1,
      );
      assert.equal(
        (
          await request(
            `/api/crm/products?vendorId=${vendor.id}`,
            "GET",
            undefined,
            a,
          )
        ).json.total,
        1,
      );
      assert.equal(
        (
          await request(
            `/api/crm/rfqs?vendorId=${vendor.id}`,
            "GET",
            undefined,
            a,
          )
        ).json.total,
        1,
      );
      assert.equal(
        (await request("/api/crm/vendors?q=Test%20Brand", "GET", undefined, b))
          .json.total,
        0,
      );
    },
  );
  await t.test(
    "document attachments are available only inside their owning workspace",
    async () => {
      const doc = await request(
        "/api/crm/documents",
        "POST",
        { name: "Test catalogue.txt", vendorId: vendor.id },
        a,
      );
      assert.equal(doc.status, 201);
      assert.equal(
        (
          await request(
            `/api/crm/documents/${doc.json.id}/file`,
            "POST",
            {
              base64: Buffer.from("private sample file").toString("base64"),
              mime: "text/plain",
            },
            a,
          )
        ).status,
        200,
      );
      const file = await fetch(
        base + `/api/crm/documents/${doc.json.id}/file`,
        { headers: { cookie: a } },
      );
      assert.equal(await file.text(), "private sample file");
      assert.match(file.headers.get("content-disposition"), /attachment/);
      assert.equal(
        (
          await request(
            `/api/crm/documents/${doc.json.id}/file`,
            "GET",
            undefined,
            b,
          )
        ).status,
        404,
      );
      assert.equal(
        (await request(`/api/crm/documents/${doc.json.id}/file`)).status,
        401,
      );
    },
  );
  await t.test(
    "invalid import rolls back every row; valid import persists",
    async () => {
      const start = (await request("/api/crm/vendors", "GET", undefined, a))
        .json.total;
      assert.equal(
        (
          await request(
            "/api/crm/import",
            "POST",
            {
              rows: [
                { name: "Should Roll Back", city: "Pune" },
                { name: "Missing City" },
              ],
            },
            a,
          )
        ).status,
        400,
      );
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, a)).json.total,
        start,
      );
      assert.equal(
        (
          await request(
            "/api/crm/import",
            "POST",
            { rows: [{ name: "Imported Test Vendor", city: "Mumbai" }] },
            a,
          )
        ).json.count,
        1,
      );
    },
  );
  await t.test(
    "paginated results are bounded and handle literal SQL metacharacters",
    async () => {
      const r = await request(
        "/api/crm/vendors?limit=1&page=2",
        "GET",
        undefined,
        a,
      );
      assert.equal(r.json.rows.length, 1);
      assert.equal(r.json.total, 2);
      assert.equal(
        (await request("/api/crm/vendors?q=%25", "GET", undefined, a)).json
          .total,
        0,
      );
    },
  );
  await t.test(
    "viewer reads but cannot mutate, owner privileges cannot be escalated",
    async () => {
      assert.equal(
        (
          await request(
            "/api/crm/team",
            "POST",
            {
              name: "Viewer",
              email: "viewer@workspace.example",
              password: "Viewer-test-123456",
              role: "viewer",
            },
            a,
          )
        ).status,
        201,
      );
      const login = await request("/api/auth/login", "POST", {
        email: "viewer@workspace.example",
        password: "Viewer-test-123456",
      });
      assert.equal(login.status, 200);
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, login.cookie))
          .status,
        200,
      );
      assert.equal(
        (
          await request(
            "/api/crm/vendors",
            "POST",
            { name: "Nope", city: "Pune" },
            login.cookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "/api/crm/team",
            "POST",
            {
              name: "Bad",
              email: "bad@workspace.example",
              password: "Viewer-test-123456",
              role: "owner",
            },
            a,
          )
        ).status,
        400,
      );
    },
  );
  await t.test(
    "unsafe origins and unauthenticated private attachments are rejected",
    async () => {
      assert.equal(
        (
          await request(
            "/api/crm/vendors",
            "POST",
            { name: "Cross origin", city: "Pune" },
            a,
            { Origin: "https://attacker.example" },
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/api/crm/documents/not-real/file")).status,
        401,
      );
    },
  );
  await t.test(
    "preferences survive sign in and logout invalidates session",
    async () => {
      assert.equal(
        (
          await request(
            "/api/crm/preferences",
            "PATCH",
            { theme: "dark", columns: ["name", "city"] },
            a,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/api/auth/me", "GET", undefined, a)).json.user
          .preferences.theme,
        "dark",
      );
      assert.equal(
        (await request("/api/auth/logout", "POST", {}, a)).status,
        200,
      );
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, a)).status,
        401,
      );
      const login = await request("/api/auth/login", "POST", {
        email: "alice@workspace.example",
        password: "Testing-local-12345",
      });
      assert.equal(
        (await request("/api/crm/vendors", "GET", undefined, login.cookie)).json
          .total,
        2,
      );
    },
  );
});
