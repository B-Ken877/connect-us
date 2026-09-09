/**
 * Application errors with user-facing French messages.
 * Raw technical errors (stack traces, driver errors) are NEVER surfaced to
 * users — actions map thrown errors through `versMessageUtilisateur`.
 */

export type CodeErreur =
  | "VALIDATION"
  | "ACCES_REFUSE"
  | "NON_AUTHENTIFIE"
  | "SESSION_EXPIREE"
  | "INTROUVABLE"
  | "CONFLIT"
  | "ETAT_INVALIDE"
  | "LIMITE_ATTEINTE"
  | "ERREUR_INTERNE";

const MESSAGES_DEFAUT: Record<CodeErreur, string> = {
  VALIDATION: "Les données saisies sont invalides. Veuillez vérifier le formulaire.",
  ACCES_REFUSE: "Vous n'êtes pas autorisé à effectuer cette action.",
  NON_AUTHENTIFIE: "Vous devez être connecté pour effectuer cette action.",
  SESSION_EXPIREE: "Votre session a expiré. Veuillez vous reconnecter.",
  INTROUVABLE: "L'élément demandé est introuvable.",
  CONFLIT: "Cette opération entre en conflit avec une autre action en cours.",
  ETAT_INVALIDE: "Cette action n'est pas possible dans l'état actuel des données.",
  LIMITE_ATTEINTE: "Trop de tentatives. Veuillez patienter un instant avant de réessayer.",
  ERREUR_INTERNE: "Une erreur interne est survenue. Veuillez réessayer ou contactez l'administrateur.",
};

export class AppError extends Error {
  readonly code: CodeErreur;
  readonly details?: Record<string, unknown>;

  constructor(code: CodeErreur, message?: string, details?: Record<string, unknown>) {
    super(message ?? MESSAGES_DEFAUT[code]);
    this.code = code;
    this.details = details;
    this.name = "AppError";
  }
}

/** Returns a safe, user-facing French message for any thrown value. */
export function versMessageUtilisateur(erreur: unknown): string {
  if (erreur instanceof AppError) return erreur.message;
  // Prisma unique constraint violations (defensive: ORM already prevents SQL injection)
  if (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code?: string }).code === "P2002"
  ) {
    return "Cette valeur existe déjà (doublon détecté).";
  }
  if (
    typeof erreur === "object" &&
    erreur !== null &&
    "code" in erreur &&
    (erreur as { code?: string }).code === "P2025"
  ) {
    return MESSAGES_DEFAUT.INTROUVABLE;
  }
  if (erreur instanceof Error && erreur.message.includes("VERSION_IMMUTABLE")) {
    return "Cette version de l'enquête est publiée et ne peut plus être modifiée.";
  }
  return MESSAGES_DEFAUT.ERREUR_INTERNE;
}

/** Extracts an AppError code from any thrown value (safe for client returns). */
export function codeErreur(erreur: unknown): CodeErreur {
  if (erreur instanceof AppError) return erreur.code;
  return "ERREUR_INTERNE";
}
