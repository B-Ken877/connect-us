/**
 * French date/time & duration formatting (server + client safe — no
 * "server-only" marker: imported by client badges and components too).
 */

export function formatDateHeureFr(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function formatDateFr(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);
}

export function formatDuree(secondes: number | null | undefined): string {
  if (secondes === null || secondes === undefined) return "—";
  const s = Math.max(0, Math.round(secondes));
  const minutes = Math.floor(s / 60);
  const reste = s % 60;
  if (minutes === 0) return `${reste} s`;
  return `${minutes} min ${String(reste).padStart(2, "0")}`;
}

export function formatPourcent(partie: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((partie / total) * 100)} %`;
}

export const LIBELLES_STATUT_APPEL: Record<string, string> = {
  EN_COURS: "En cours",
  TERMINE: "Appel terminé",
  SANS_REPONSE: "Sans réponse",
  OCCUPE: "Occupé",
  NUMERO_INCORRECT: "Mauvais numéro",
  REFUS: "Refusé",
  RAPPEL: "Rappel demandé",
  ABANDONNE: "Abandonné",
  // ---- UNITED Research — nouveaux résultats ----
  MESSAGERIE: "Messagerie vocale",
  NE_PAS_RAPPELER: "Ne plus appeler",
  AUTRE: "Autre",
};

/**
 * Masque partiellement un numéro de téléphone pour la confidentialité.
 * Affiche seulement les 4 derniers chiffres, masque le reste.
 * Ex: "+509 5500 1234" → "••••••••1234"
 * Utilisé dans les vues admin où le numéro complet n'est pas nécessaire.
 */
export function masquerTelephone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const chiffres = phone.replace(/\D/g, "");
  if (chiffres.length < 4) return "—";
  return "•".repeat(Math.max(4, chiffres.length - 4)) + chiffres.slice(-4);
}

export const LIBELLES_STATUT_AGENT: Record<string, string> = {
  DISPONIBLE: "Disponible",
  EN_APPEL: "En appel",
  EN_ENTRETIEN: "En entretien",
  EN_PAUSE: "En pause",
  HORS_LIGNE: "Hors ligne",
};

export const LIBELLES_STATUT_REPONDANT: Record<string, string> = {
  DISPONIBLE: "Disponible",
  EN_COURS: "En cours d'appel",
  INTERROGE: "Interrogé",
  RAPPEL_PLANIFIE: "Rappel planifié",
  INJOIGNABLE: "Injoignable",
  EXCLU: "Exclu",
};

export const LIBELLES_STATUT_ENTRETIEN: Record<string, string> = {
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  ABANDONNE: "Abandonné",
};

export const LIBELLES_STATUT_QUALITE: Record<string, string> = {
  NON_EXAMINE: "Non examiné",
  A_EXAMINER: "À examiner",
  VALIDE: "Validé",
  REJETE: "Rejeté",
  FAUX_POSITIF: "Faux positif",
};

export const LIBELLES_TYPE_SIGNALEMENT: Record<string, string> = {
  DUREE_TROP_COURTE: "Durée trop courte",
  DOUBLON: "Doublon",
  REPETITION_REPONSES: "Réponses répétées",
  ACTIVITE_EXCESSIVE: "Activité excessive",
  INCOHERENCE: "Incohérence",
};

export const LIBELLES_SEVERITE: Record<string, string> = {
  FAIBLE: "Faible",
  MOYENNE: "Moyenne",
  ELEVEE: "Élevée",
  CRITIQUE: "Critique",
};

export const LIBELLES_STATUT_VERSION: Record<string, string> = {
  BROUILLON: "Brouillon",
  PUBLIEE: "Publiée",
  ARCHIVEE: "Archivée",
};
