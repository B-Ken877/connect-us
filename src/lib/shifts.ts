/**
 * UNITED Research — Gestion des shifts d'agents.
 *
 * Deux shifts par jour (heure Eastern Time — America/New_York):
 *   Shift 1 : agent001-agent050 — 08:00 à 13:55
 *   Shift 2 : agent051-agent100 — 14:00 à 20:00
 *
 * Règles:
 *   - Un agent ne peut se connecter QUE pendant son shift.
 *   - À la fin du shift, l'agent est automatiquement déconnecté.
 *   - Il ne peut pas se reconnecter jusqu'au début de son prochain shift
 *     (le lendemain à l'heure de début de son shift).
 *
 * Détermination du shift : basée sur le numéro extrait du username.
 *   - agent001 à agent050 → Shift 1
 *   - agent051 à agent100 → Shift 2
 *   - admin et autres comptes (hors pattern) → toujours autorisé (ADMINISTRATEUR)
 *
 * TIMEZONE — utilise America/New_York via Intl.DateTimeFormat pour gérer
 * automatiquement le passage EDT (UTC-4, été) ↔ EST (UTC-5, hiver).
 * Ne pas utiliser un offset fixe — cela casserait au changement d'heure.
 */

export interface DefinitionShift {
  id: "SHIFT_1" | "SHIFT_2";
  libelle: string;
  heureDebut: number;   // heure locale Eastern (0-23)
  minuteDebut: number;   // minutes (0-59)
  heureFin: number;      // heure locale Eastern
  minuteFin: number;     // minutes
  numeroMin: number;      // numéro d'agent min (inclus)
  numeroMax: number;      // numéro d'agent max (inclus)
}

export const SHIFTS: DefinitionShift[] = [
  {
    id: "SHIFT_1",
    libelle: "Shift du matin (08:00 - 13:55)",
    heureDebut: 8,
    minuteDebut: 0,
    heureFin: 13,
    minuteFin: 55,
    numeroMin: 1,
    numeroMax: 50,
  },
  {
    id: "SHIFT_2",
    libelle: "Shift de l'après-midi (14:00 - 20:00)",
    heureDebut: 14,
    minuteDebut: 0,
    heureFin: 20,
    minuteFin: 0,
    numeroMax: 100,
    numeroMin: 51,
  },
];

/** Timezone IANA pour l'heure Eastern (gère EDT/EST automatiquement). */
const TIMEZONE_EASTERN = "America/New_York";

/** Extrait le numéro d'agent du username (ex: "agent001" → 1, "agent042" → 42). */
export function extraireNumeroAgent(username: string): number | null {
  const match = username.match(/(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/** Détermine le shift d'un agent selon son username. Retourne null si non-applicable. */
export function shiftPourAgent(username: string): DefinitionShift | null {
  const num = extraireNumeroAgent(username);
  if (num === null) return null;
  return SHIFTS.find((s) => num >= s.numeroMin && num <= s.numeroMax) ?? null;
}

/**
 * Retourne l'heure et minute actuelles en Eastern Time (America/New_York).
 * Utilise Intl.DateTimeFormat qui gère automatiquement le passage
 * EDT (UTC-4, mars → novembre) ↔ EST (UTC-5, novembre → mars).
 */
function heureMinuteEastern(): { heure: number; minute: number } {
  const maintenant = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_EASTERN,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parties = formatter.formatToParts(maintenant);
  const heure = parseInt(parties.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parties.find((p) => p.type === "minute")?.value ?? "0", 10);
  // Intl peut retourner "24" pour minuit en hour12:false → normaliser à 0.
  return { heure: heure % 24, minute };
}

/**
 * Vérifie si le shift est actuellement actif (on est dans la plage horaire).
 * Compare l'heure actuelle Eastern avec la plage [debut, fin).
 */
export function shiftEstActif(shift: DefinitionShift): boolean {
  const { heure, minute } = heureMinuteEastern();
  const minutesActuelles = heure * 60 + minute;
  const debutMinutes = shift.heureDebut * 60 + shift.minuteDebut;
  const finMinutes = shift.heureFin * 60 + shift.minuteFin;
  return minutesActuelles >= debutMinutes && minutesActuelles < finMinutes;
}

export interface ResultatVerifShift {
  autorise: boolean;
  message?: string;
  shift: DefinitionShift | null;
}

/**
 * Vérifie si un utilisateur (par username + rôle) peut se connecter maintenant.
 * - ADMINISTRATEUR → toujours autorisé
 * - AGENT → autorisé seulement si son shift est actif
 */
export function verifierAccesShift(username: string, role: string): ResultatVerifShift {
  // Les administrateurs ne sont pas soumis aux shifts.
  if (role === "ADMINISTRATEUR") {
    return { autorise: true, shift: null };
  }

  const shift = shiftPourAgent(username);
  if (!shift) {
    // Agent hors pattern (ex: "agent.test") — pas de shift, accès libre.
    return { autorise: true, shift: null };
  }

  if (shiftEstActif(shift)) {
    return { autorise: true, shift };
  }

  // Hors shift — message clair indiquant l'heure de début.
  return {
    autorise: false,
    shift,
    message:
      `Votre shift (${shift.libelle}) n'est pas actif pour le moment. ` +
      `Vous pouvez vous reconnecter à ${String(shift.heureDebut).padStart(2, "0")}:${String(shift.minuteDebut).padStart(2, "0")} (heure Eastern).`,
  };
}
