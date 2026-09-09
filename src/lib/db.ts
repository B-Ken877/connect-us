import { PrismaClient } from "@prisma/client";

/**
 * Runtime DATABASE_URL guard.
 *
 * Some sandbox environments export a legacy `DATABASE_URL` (SQLite) at the
 * process level, which Next.js preserves (process.env wins over .env files).
 * This guard restores the PostgreSQL URL from the project .env when the
 * process-level URL is missing or points at a file. In production the real
 * environment variable is always respected and takes precedence.
 */
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.startsWith("file:") ||
  !process.env.DATABASE_URL.startsWith("postgres")
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const envFile = path.join(process.cwd(), ".env");
    if (fs.existsSync(envFile)) {
      for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)"?\s*$/);
        if (m?.[1]?.startsWith("postgres")) {
          process.env.DATABASE_URL = m[1];
          break;
        }
      }
    }
  } catch {
    // best-effort only
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
