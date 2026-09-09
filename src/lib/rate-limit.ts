/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Scope: protects sensitive endpoints (login) against brute-force on a single
 * instance. On serverless, each instance keeps its own window — acceptable
 * for V1, documented in ARCHITECTURE.md (a shared store such as Upstash Redis
 * can be plugged behind the same function signature later).
 */
const fenetres = new Map<string, number[]>();

export function verifierLimite(
  cle: string,
  maxTentatives: number,
  fenetreMs: number,
): { autorise: boolean; restantMs: number } {
  const maintenant = Date.now();
  const tentatives = (fenetres.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);

  if (tentatives.length >= maxTentatives) {
    const restantMs = fenetreMs - (maintenant - tentatives[0]);
    return { autorise: false, restantMs };
  }

  tentatives.push(maintenant);
  fenetres.set(cle, tentatives);

  // Opportunistic cleanup to keep the map bounded.
  if (fenetres.size > 10_000) {
    for (const [k, v] of fenetres) {
      if (v.every((t) => maintenant - t >= fenetreMs)) fenetres.delete(k);
    }
  }

  return { autorise: true, restantMs: 0 };
}
