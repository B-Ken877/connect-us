/**
 * Vitest stub for the "server-only" package.
 * Server services import "server-only" to be excluded from client bundles;
 * outside Next.js (vitest) the package throws at import time, so tests alias
 * it to this no-op module.
 */
export {};
