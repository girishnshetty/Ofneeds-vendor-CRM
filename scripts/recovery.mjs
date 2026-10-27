import { DatabaseSync } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { vault } from "../server/security.mjs";
import { createBackup, restoreBackup } from "../server/backups.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  data = resolve(process.env.CRM_DATA_DIR || resolve(root, ".data"));
const args = process.argv.slice(2),
  get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")
      ? args[i + 1]
      : undefined;
  };
if (args.includes("--restore")) {
  if (
    !get("--restore") ||
    !get("--to") ||
    (!get("--key-dir") && !process.env.CRM_ENCRYPTION_KEY)
  )
    throw Error(
      "Restore requires --restore archive --to NEW_EMPTY_DIRECTORY and --key-dir SOURCE_KEY_DIRECTORY, or CRM_ENCRYPTION_KEY.",
    );
  const keys = resolve(get("--key-dir") || data);
  if (
    !process.env.CRM_ENCRYPTION_KEY &&
    !existsSync(resolve(keys, "security.key"))
  )
    throw Error("The original backup key is required.");
  const result = await restoreBackup(
    get("--restore"),
    get("--to"),
    vault(keys, false),
    keys,
  );
  console.log(JSON.stringify(result));
} else if (args.includes("--backup")) {
  if (!existsSync(resolve(data, "crm.sqlite")))
    throw Error("No existing database at CRM_DATA_DIR.");
  const db = new DatabaseSync(resolve(data, "crm.sqlite"));
  try {
    console.log(
      JSON.stringify(
        await createBackup(
          db,
          data,
          vault(data, process.env.NODE_ENV === "production"),
        ),
      ),
    );
  } finally {
    db.close();
  }
} else
  console.log(
    "Usage: node scripts/recovery.mjs --backup OR --restore FILE --to NEW_EMPTY_DIRECTORY --key-dir SOURCE_KEY_DIRECTORY",
  );
