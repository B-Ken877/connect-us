/**
 * UNITED Research — database bootstrap helper for development.
 *
 * The sandbox shell exports a legacy DATABASE_URL (SQLite) that would override
 * the project .env for Prisma CLI commands. This wrapper:
 *   1. ensures the embedded PostgreSQL server is running (scripts/dev-db.ts),
 *   2. re-runs `prisma db push` with the DATABASE_URL from .env (PostgreSQL),
 *   3. applies prisma/guards.sql (DB-level immutability of published versions).
 *
 * Production never relies on this script — migrations are applied with
 * `prisma db push` / `prisma migrate deploy` against the managed database.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function readEnvFile(): Record<string, string> {
  const file = path.join(ROOT, ".env");
  const vars: Record<string, string> = {};
  if (!fs.existsSync(file)) return vars;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m && m[1] && !m[1].startsWith("#")) vars[m[1]] = m[2];
  }
  return vars;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const res = spawnSync(cmd, args, { env, cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`[db-push] Command failed: ${cmd} ${args.join(" ")}`);
    process.exit(res.status ?? 1);
  }
}

const fileVars = readEnvFile();
if (!fileVars.DATABASE_URL?.startsWith("postgres")) {
  console.error("[db-push] DATABASE_URL in .env must be a postgresql:// URL.");
  process.exit(1);
}

const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: fileVars.DATABASE_URL };

run("bun", ["scripts/dev-db.ts"], env); // exits immediately if already running
run("bunx", ["prisma", "db", "push", "--accept-data-loss"], env);
run("bunx", ["prisma", "db", "execute", "--file", "prisma/guards.sql", "--schema", "prisma/schema.prisma"], env);
run("bunx", ["prisma", "generate"], env);

console.log("[db-push] Database ready (PostgreSQL, schema pushed, guards applied).");
