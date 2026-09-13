/**
 * Vitest setup — runs BEFORE test modules are imported.
 * Forces the test PostgreSQL database: tests must NEVER touch the development
 * or production database, whatever the shell environment exports.
 */
const urlTest = process.env.UNITED_TEST_DATABASE_URL;
if (!urlTest) {
  throw new Error(
    "[tests] UNITED_TEST_DATABASE_URL manquant — le globalSetup doit démarrer la base de test.",
  );
}
// Unconditional: isolation is non-negotiable.
process.env.DATABASE_URL = urlTest;
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "united-research-test-secret";
