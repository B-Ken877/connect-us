/**
 * Vitest global setup — boots a REAL PostgreSQL (embedded-postgres, same
 * engine as production) on an isolated port, pushes the Prisma schema and
 * applies the integrity guards. The data directory is persistent: subsequent
 * runs start instantly and tests truncate their tables.
 *
 * The database used here is EXCLUSIVELY a test database (port 5434, database
 * gig_survey_test) — never the development or production one.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PORT = 5434;
const DATA_DIR = path.join(ROOT, ".pgdata-test");
const USER = "gig";
const PASSWORD = "gig";
const DB_NAME = "gig_survey_test";
const URL_TEST = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}?schema=public`;

function portOuvert(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const termine = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1200);
    socket.once("connect", () => termine(true));
    socket.once("timeout", () => termine(false));
    socket.once("error", () => termine(false));
    socket.connect(port, "127.0.0.1");
  });
}

export default async function globalSetup() {
  // Only stop PostgreSQL at teardown if THIS run started it.
  let demarreIci: { stop: () => Promise<void> } | null = null;

  if (!(await portOuvert(PORT))) {
    const EmbeddedPostgres = (await import("embedded-postgres")).default;
    const frais = !fs.existsSync(path.join(DATA_DIR, "PG_VERSION"));
    const pg = new EmbeddedPostgres({
      databaseDir: DATA_DIR,
      user: USER,
      password: PASSWORD,
      port: PORT,
      persistent: true,
    });
    if (frais) {
      console.log("[tests] Initialisation de PostgreSQL (test)…");
      await pg.initialise();
    }
    console.log("[tests] Démarrage de PostgreSQL (test)…");
    await pg.start();
    try {
      await pg.createDatabase(DB_NAME);
    } catch {
      /* déjà créée */
    }
    demarreIci = { stop: () => pg.stop() };
  }

  process.env.GIG_TEST_DATABASE_URL = URL_TEST;

  const env = { ...process.env, DATABASE_URL: URL_TEST };
  let res = spawnSync("bunx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env,
    cwd: ROOT,
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error("[tests] prisma db push a échoué sur la base de test.");

  res = spawnSync(
    "bunx",
    ["prisma", "db", "execute", "--file", "prisma/guards.sql", "--schema", "prisma/schema.prisma"],
    { env, cwd: ROOT, stdio: "inherit" },
  );
  if (res.status !== 0) throw new Error("[tests] application des guards a échoué.");

  return async () => {
    if (demarreIci) {
      try {
        await demarreIci.stop();
      } catch {
        /* best-effort */
      }
    }
  };
}
