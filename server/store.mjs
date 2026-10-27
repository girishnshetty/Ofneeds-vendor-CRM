import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,name TEXT NOT NULL,profile TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES workspaces(id),email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','member','viewer')),preferences TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES workspaces(id),kind TEXT NOT NULL,name TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS records_scope ON records(workspace,kind,name);
    CREATE INDEX IF NOT EXISTS records_vendor ON records(workspace,kind,json_extract(payload,'$.vendorId'));
    CREATE INDEX IF NOT EXISTS records_city ON records(workspace,kind,json_extract(payload,'$.city'));
    CREATE TABLE IF NOT EXISTS activity(id TEXT PRIMARY KEY,workspace TEXT NOT NULL REFERENCES workspaces(id),text TEXT NOT NULL,created TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS activity_scope ON activity(workspace,created);
    CREATE TABLE IF NOT EXISTS files(record_id TEXT PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,workspace TEXT NOT NULL,content BLOB NOT NULL,mime TEXT NOT NULL);
  `);
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function log(db, workspace, text) {
  db.prepare("INSERT INTO activity VALUES(?,?,?,?)").run(
    randomUUID(),
    workspace,
    text,
    new Date().toISOString(),
  );
}
