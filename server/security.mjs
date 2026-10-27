import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function base32(bytes) {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function unbase32(text) {
  let bits = 0,
    value = 0;
  const result = [];
  for (const ch of text) {
    const n = alphabet.indexOf(ch);
    if (n < 0) throw Error("Invalid authenticator secret");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
export function totp(secret, epoch = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(epoch / 30000)));
  const bytes = createHmac("sha1", unbase32(secret)).update(counter).digest(),
    offset = bytes[19] & 15;
  return String((bytes.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
export function counterFor(secret, code, last = -1, epoch = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  for (const skew of [-1, 0, 1]) {
    const time = epoch + skew * 30000,
      counter = Math.floor(time / 30000);
    if (
      counter >= 0 &&
      counter > last &&
      timingSafeEqual(Buffer.from(totp(secret, time)), Buffer.from(code))
    )
      return counter;
  }
  return null;
}
export function vault(directory, production = false) {
  let cached;
  const key = () => {
    if (cached) return cached;
    const configured = process.env.CRM_ENCRYPTION_KEY;
    if (configured) {
      if (!/^[a-f0-9]{64}$/i.test(configured))
        throw Error("CRM_ENCRYPTION_KEY must be 64 hexadecimal characters");
      return (cached = Buffer.from(configured, "hex"));
    }
    if (production)
      throw Object.assign(
        Error(
          "Configure CRM_ENCRYPTION_KEY for encrypted security and backups.",
        ),
        { status: 503 },
      );
    const path = join(directory, "security.key");
    if (!existsSync(path))
      writeFileSync(path, randomBytes(32).toString("hex"), {
        mode: 0o600,
        flag: "wx",
      });
    const stat = lstatSync(path),
      raw = readFileSync(path, "utf8");
    if (!stat.isFile() || stat.isSymbolicLink() || !/^[a-f0-9]{64}$/i.test(raw))
      throw Error("Invalid local encryption key");
    return (cached = Buffer.from(raw, "hex"));
  };
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key(), iv);
      const encrypted = Buffer.concat([
        cipher.update(Buffer.isBuffer(value) ? value : Buffer.from(value)),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), encrypted]
        .map((b) => b.toString("base64"))
        .join(".");
    },
    open(value) {
      const [iv, tag, body] = String(value)
        .split(".")
        .map((s) => Buffer.from(s, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", key(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    },
    sign(value) {
      return createHmac("sha256", key()).update(value).digest("hex");
    },
  };
}
export function migrateSecurity(db) {
  db.exec(`
 CREATE TABLE IF NOT EXISTS account_security(user_id TEXT PRIMARY KEY REFERENCES users(id),verified_at TEXT,mfa_secret TEXT,pending_secret TEXT,last_counter INTEGER NOT NULL DEFAULT -1,recovery_codes TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS session_info(token TEXT PRIMARY KEY REFERENCES sessions(token) ON DELETE CASCADE,agent TEXT,created TEXT,last_seen TEXT);
 CREATE TABLE IF NOT EXISTS access_tokens(hash TEXT PRIMARY KEY,type TEXT NOT NULL,user_id TEXT,workspace TEXT,vendor_id TEXT,email TEXT,role TEXT,expires INTEGER NOT NULL,used_at TEXT,payload TEXT NOT NULL DEFAULT '{}');
 CREATE INDEX IF NOT EXISTS access_scope ON access_tokens(workspace,type,expires);
 CREATE TABLE IF NOT EXISTS mfa_challenges(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS audit_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,workspace TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,kind TEXT,record_id TEXT,before_json TEXT,after_json TEXT,created TEXT NOT NULL,previous_hash TEXT NOT NULL,event_hash TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS audit_scope ON audit_events(workspace,seq);
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit entries are append-only'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'Audit entries are append-only'); END;
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,channel TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,encrypted_body TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created TEXT NOT NULL,sent TEXT,dedupe TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,scopes TEXT NOT NULL,expires INTEGER NOT NULL,revoked TEXT,last_used TEXT);
 `);
}
export function audit(
  db,
  user,
  action,
  kind = "",
  recordId = "",
  before = null,
  after = null,
) {
  const workspace = user.workspace,
    previous =
      db
        .prepare(
          "SELECT event_hash FROM audit_events WHERE workspace=? ORDER BY seq DESC LIMIT 1",
        )
        .get(workspace)?.event_hash || "genesis";
  const fields = {
    id: randomUUID(),
    workspace,
    actor: user.id,
    action,
    kind,
    recordId,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
    created: new Date().toISOString(),
    previous,
  };
  const hash = digest(JSON.stringify(fields));
  db.prepare(
    "INSERT INTO audit_events(id,workspace,actor,action,kind,record_id,before_json,after_json,created,previous_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    fields.id,
    workspace,
    user.id,
    action,
    kind,
    recordId,
    fields.before,
    fields.after,
    fields.created,
    previous,
    hash,
  );
}
export function auditValid(rows) {
  let previous = "genesis";
  for (const row of rows) {
    const fields = {
      id: row.id,
      workspace: row.workspace,
      actor: row.actor,
      action: row.action,
      kind: row.kind,
      recordId: row.record_id,
      before: row.before_json,
      after: row.after_json,
      created: row.created,
      previous: row.previous_hash,
    };
    if (
      row.previous_hash !== previous ||
      digest(JSON.stringify(fields)) !== row.event_hash
    )
      return false;
    previous = row.event_hash;
  }
  return true;
}
