import { backup, DatabaseSync } from "node:sqlite";
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  copyFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "./security.mjs";
export async function createBackup(db, dataDirectory, secretVault) {
  const folder = resolve(dataDirectory, "backups");
  await mkdir(folder, { recursive: true });
  const id = randomUUID(),
    stage = join(folder, `.snapshot-${id}.sqlite`),
    target = join(
      folder,
      `${new Date().toISOString().replaceAll(":", "-")}-${id}.crmbackup`,
    );
  try {
    await backup(db, stage);
    const bytes = await readFile(stage),
      payload = secretVault.seal(bytes);
    await writeFile(
      target,
      JSON.stringify({
        format: "ofneeds-crm-encrypted-backup",
        version: 1,
        created: new Date().toISOString(),
        checksum: digest(bytes),
        payload,
      }),
      { mode: 0o600, flag: "wx" },
    );
    return { path: target, checksum: digest(bytes), bytes: bytes.length };
  } finally {
    if (existsSync(stage)) await unlink(stage);
  }
}
export async function restoreBackup(
  archive,
  destination,
  secretVault,
  keyDirectory,
) {
  const file = JSON.parse(await readFile(resolve(archive), "utf8"));
  if (file.format !== "ofneeds-crm-encrypted-backup" || file.version !== 1)
    throw Error("Unsupported backup format.");
  const bytes = secretVault.open(file.payload);
  if (
    digest(bytes) !== file.checksum ||
    bytes.subarray(0, 16).toString() !== "SQLite format 3\u0000"
  )
    throw Error("Backup integrity check failed.");
  const target = resolve(destination);
  if (existsSync(target) && (await readdir(target)).length)
    throw Error(
      "Restore destination must be a new or empty directory. The active database is never overwritten.",
    );
  await mkdir(target, { recursive: true });
  const output = join(target, "crm.sqlite");
  await writeFile(output, bytes, { mode: 0o600, flag: "wx" });
  let db;
  try {
    db = new DatabaseSync(output);
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw Error("Restored database integrity failed.");
    for (const table of [
      "session_info",
      "sessions",
      "mfa_challenges",
      "access_tokens",
      "portal_sessions",
      "api_keys",
    ])
      if (
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(table)
      )
        db.exec(`DELETE FROM ${table}`);
    db.close();
    db = null;
    if (
      !process.env.CRM_ENCRYPTION_KEY &&
      keyDirectory &&
      existsSync(join(keyDirectory, "security.key"))
    )
      await copyFile(
        join(keyDirectory, "security.key"),
        join(target, "security.key"),
      );
    return { path: output, sessionsRevoked: true };
  } catch (error) {
    db?.close();
    await unlink(output);
    throw error;
  }
}
