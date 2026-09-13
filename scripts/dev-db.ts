/**
 * UNITED Research — Local development database bootstrap.
 *
 * Runs a REAL embedded PostgreSQL 18 binary (via embedded-postgres) so that
 * the local development environment matches production exactly (Vercel +
 * managed PostgreSQL). This script is idempotent: if the database is already
 * listening, it exits immediately.
 *
 * Production never uses this file — production DATABASE_URL points at the
 * managed PostgreSQL provider (Neon / Vercel Postgres / RDS…).
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(__dirname, "..", ".pgdata");
const PORT = 5433;
const USER = "gig";
const PASSWORD = "gig";
const DB_NAME = "gig_survey";

function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function main() {
  if (await isPortOpen(PORT)) {
    console.log(`[dev-db] PostgreSQL already listening on ${PORT} — nothing to do.`);
    process.exit(0);
  }

  const EmbeddedPostgres = (await import("embedded-postgres")).default;
  const fresh = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  if (fresh) {
    console.log("[dev-db] Initialising fresh PostgreSQL data directory…");
    await pg.initialise();
  }

  console.log("[dev-db] Starting PostgreSQL…");
  await pg.start();

  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[dev-db] Database "${DB_NAME}" created.`);
  } catch {
    console.log(`[dev-db] Database "${DB_NAME}" already exists.`);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[dev-db] Ready: postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`);

  // Keep the process alive so the spawned postgres processes persist.
  setInterval(() => {
    /* heartbeat */
  }, 60_000);
}

main().catch((err) => {
  console.error("[dev-db] Fatal:", err);
  process.exit(1);
});
