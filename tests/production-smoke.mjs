import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
mkdirSync("test-results", { recursive: true });
const port = 4322,
  base = `http://127.0.0.1:${port}`,
  directory = mkdtempSync(resolve("test-results/production-"));
const child = spawn(process.execPath, ["server/index.mjs", "--production"], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "production",
    APP_URL: "https://crm.example.test",
    CRM_DATA_DIR: directory,
    CRM_ENCRYPTION_KEY: "a".repeat(64),
    CRM_BACKUP_INTERVAL_HOURS: "0",
    CRM_AUTOMATION_INTERVAL_SECONDS: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stderr.on("data", (d) => (output += d));
child.stdout.on("data", (d) => (output += d));
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (i === 59) throw Error(output);
    await delay(200);
  }
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /OfNeeds Vendor CRM/);
  assert.ok(page.headers.get("content-security-policy"));
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.equal((await fetch(base + "/api/crm/vendors")).status, 401);
  const hidden = await fetch(base + "/.data/crm.sqlite");
  assert.ok(
    [403, 404].includes(hidden.status) ||
      hidden.headers.get("content-type")?.includes("text/html"),
  );
  const source = await fetch(base + "/server/index.mjs");
  assert.ok(!(await source.text()).includes("scryptSync"));
  const signup = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://crm.example.test",
    },
    body: JSON.stringify({
      name: "Smoke Owner",
      company: "Isolated Smoke Test",
      email: "smoke@workspace.example",
      password: "Local-smoke-test-12345",
    }),
  });
  assert.equal(signup.status, 201);
  assert.match(signup.headers.get("set-cookie"), /HttpOnly/);
  assert.match(signup.headers.get("set-cookie"), /Secure/);
  assert.match(signup.headers.get("set-cookie"), /SameSite=Lax/);
  const cookie = signup.headers.get("set-cookie").split(";")[0];
  const supplierResponse = await fetch(base + "/api/crm/vendors", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: "Smoke supplier", city: "Pune" }),
  });
  assert.equal(supplierResponse.status, 201);
  const supplier = await supplierResponse.json();
  const doc = await fetch(base + "/api/crm/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: "Scanner smoke document",
      vendorId: supplier.id,
    }),
  });
  assert.equal(doc.status, 201);
  const document = await doc.json();
  const upload = await fetch(
    base + "/api/crm/documents/" + document.id + "/file",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        mime: "text/plain",
        base64: Buffer.from("Scan me").toString("base64"),
      }),
    },
  );
  assert.equal(
    upload.status,
    503,
    "production uploads fail closed without a scanner",
  );
  const badOrigin = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://elsewhere.example",
    },
    body: "{}",
  });
  assert.equal(badOrigin.status, 403);
  console.log(
    "Production smoke passed: compiled landing page, health, protected APIs, private source/data boundaries, security headers, Secure cookies and origin checks.",
  );
} finally {
  child.kill();
}
