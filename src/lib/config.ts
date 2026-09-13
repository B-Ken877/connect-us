/**
 * Central runtime configuration (env-driven, with safe defaults).
 * All tunables live here so services never read process.env directly.
 */

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  auth: {
    // Nom du cookie de session. Changé (gig_session -> united_session) lors du
    // rebrand UNITED Research : décision de sécurité documentée — tous les
    // cookies de session existants deviennent invalides, ce qui force une
    // reconnexion de tous les utilisateurs. Aucune donnée serveur n'est perdue.
    cookieName: "united_session",
    /** Durée de vie de la session en heures. */
    heures: 12,
    // Secret de développement (UNIQUEMENT si AUTH_SECRET n'est pas défini).
    // En production, estProduction() lève une erreur si AUTH_SECRET est absent
    // (voir lib/auth/password.ts -> secretSession).
    secret: process.env.AUTH_SECRET ?? "united-research-dev-secret-do-not-use-in-production",
  },
  dialer: {
    provider: process.env.DIALER_PROVIDER ?? "native",
  },
  file: {
    /** Minutes before a stale respondent assignment lock is auto-released. */
    verrouMinutes: num(process.env.ASSIGNMENT_LOCK_MINUTES, 120),
    /** Max call attempts before a respondent is considered unreachable. */
    maxTentatives: num(process.env.MAX_ATTEMPTS_PER_RESPONDENT, 5),
  },
  qualite: {
    /** Minimum plausible total interview duration (seconds). */
    dureeMinimaleSecondes: num(process.env.QUALITY_MIN_DURATION_SECONDS, 90),
    /** Minimum plausible seconds per visible question. */
    secondesParQuestion: num(process.env.QUALITY_MIN_SECONDS_PER_QUESTION, 6),
    /** Identical-answer-signature interviews (same agent) before flagging. */
    seuilRepetition: num(process.env.QUALITY_REPETITION_THRESHOLD, 4),
    /** Interviews in one day above mean + z*sigma triggers ACTIVITE_EXCESSIVE. */
    zScoreActivite: num(process.env.QUALITY_ACTIVITY_ZSCORE, 25) / 10,
    volumeMinimalActivite: num(process.env.QUALITY_ACTIVITY_MIN_VOLUME, 12),
  },
  supervision: {
    /** Seconds after which an agent without heartbeat is shown as inactive. */
    heartbeatSecondes: 90,
  },
} as const;

export function estProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
