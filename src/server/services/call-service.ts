import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { marquerEtatActivite } from "@/server/services/agent-session-service";
import { enregistrerAudit } from "@/lib/audit";
import type { Prisma, StatutAppel } from "@prisma/client";

/**
 * CALL LIFECYCLE — outcome recording & callback scheduling.
 * The dialing itself goes through the DialerProvider abstraction (client side
 * for V1) — this service only manages platform state around the call.
 *
 * CATI WORKFLOW (refactor): a call attempt and its interview are created
 * together at assignment. The call is closed at DISPOSITION time:
 *  - "Entretien complété" → interview submission closes the call as TERMINE
 *    (see interview-service.soumettreEntretien);
 *  - any other disposition → cloturerAppelSansEntretien closes the call with
 *    the real outcome and abandons the interview;
 *  - the legacy call screen (pre-refactor data) still uses
 *    enregistrerResultatAppel below.
 */

export interface DonneesResultatAppel {
  statut: Exclude<StatutAppel, "EN_COURS">;
  dureeSecondes?: number;
  notes?: string;
  rappelDate?: string; // yyyy-mm-dd
  rappelHeure?: string; // HH:mm
}

type Tx = Prisma.TransactionClient;

function resoudreRappelPrevu(donnees: DonneesResultatAppel): Date | null {
  if (donnees.statut !== "RAPPEL") return null;
  const combinee = new Date(`${donnees.rappelDate}T${donnees.rappelHeure}:00`);
  if (!donnees.rappelDate || !donnees.rappelHeure || Number.isNaN(combinee.getTime())) {
    throw new AppError("VALIDATION", "La date ou l'heure de rappel saisie n'est pas valide.");
  }
  if (combinee.getTime() < Date.now() - 60_000) {
    throw new AppError("VALIDATION", "La date de rappel doit être dans le futur.");
  }
  return combinee;
}

function statutRepondantPour(statut: DonneesResultatAppel["statut"]) {
  switch (statut) {
    case "TERMINE":
      return "EN_COURS" as const; // stays owned by the agent for the interview
    case "RAPPEL":
      return "RAPPEL_PLANIFIE" as const;
    case "REFUS":
    case "NUMERO_INCORRECT":
      return "EXCLU" as const;
    default: // SANS_REPONSE / OCCUPE / ABANDONNE
      return "DISPONIBLE" as const;
  }
}

/**
 * Core outcome logic shared by every closing path. MUST run inside the
 * caller's transaction: updates the call attempt, the respondent state and
 * the agent presence coherently.
 */
export async function appliquerResultatAppel(
  tx: Tx,
  appel: { id: string; respondentId: string; agentId: string; startedAt: Date },
  donnees: DonneesResultatAppel,
  maintenant: Date,
) {
  const rappelPrevuA = resoudreRappelPrevu(donnees);
  const duree =
    donnees.dureeSecondes !== undefined
      ? donnees.dureeSecondes
      : Math.max(0, Math.floor((maintenant.getTime() - appel.startedAt.getTime()) / 1000));
  const echeanceVerrou = new Date(maintenant.getTime() + 120 * 60_000); // refreshed by queue resume flow
  const statutRepondant = statutRepondantPour(donnees.statut);

  await tx.callAttempt.update({
    where: { id: appel.id },
    data: {
      status: donnees.statut,
      endedAt: maintenant,
      durationSeconds: duree,
      notes: donnees.notes?.trim() ? donnees.notes.trim() : null,
      callbackAt: rappelPrevuA,
    },
  });

  await tx.respondent.update({
    where: { id: appel.respondentId },
    data: {
      status: statutRepondant,
      assignedToId: statutRepondant === "EN_COURS" ? appel.agentId : null,
      assignedAt: statutRepondant === "EN_COURS" ? maintenant : null,
      lockExpiresAt: statutRepondant === "EN_COURS" ? echeanceVerrou : null,
    },
  });

  if (statutRepondant !== "EN_COURS") {
    await marquerEtatActivite(appel.agentId, "DISPONIBLE");
  }

  return { appelId: appel.id, statutRepondant, rappelPrevuA };
}

export async function obtenirAppelActif(agentId: string) {
  return db.callAttempt.findFirst({
    where: { agentId, status: "EN_COURS" },
    include: { respondent: true },
  });
}

export async function obtenirAppel(agentId: string, callAttemptId: string) {
  const appel = await db.callAttempt.findUnique({
    where: { id: callAttemptId },
    include: { respondent: true },
  });
  if (!appel) throw new AppError("INTROUVABLE", "Cet appel est introuvable.");
  if (appel.agentId !== agentId) {
    throw new AppError("ACCES_REFUSE", "Cet appel n'est pas attribué à votre session.");
  }
  return appel;
}

/**
 * Legacy call-screen outcome recording (pre-refactor in-flight data).
 * Non-TERMINE outcomes also abandon a live interview attached to the call, so
 * the invariant "an open call always belongs to a live interview" holds in
 * every flow.
 */
export async function enregistrerResultatAppel(params: {
  agentId: string;
  callAttemptId: string;
  donnees: DonneesResultatAppel;
}) {
  const { agentId, callAttemptId, donnees } = params;

  return db.$transaction(async (tx) => {
    const appel = await tx.callAttempt.findUnique({
      where: { id: callAttemptId },
      include: { respondent: true },
    });
    if (!appel) throw new AppError("INTROUVABLE", "Cet appel est introuvable.");
    if (appel.agentId !== agentId) throw new AppError("ACCES_REFUSE");
    if (appel.status !== "EN_COURS") {
      throw new AppError("ETAT_INVALIDE", "Cet appel a déjà été clôturé.");
    }

    const maintenant = new Date();
    const resultat = await appliquerResultatAppel(tx, appel, donnees, maintenant);

    if (donnees.statut !== "TERMINE") {
      const entretien = await tx.interview.findUnique({ where: { callAttemptId: appel.id } });
      if (entretien && entretien.status === "EN_COURS") {
        await tx.interview.update({ where: { id: entretien.id }, data: { status: "ABANDONNE" } });
      }
    }

    return resultat;
  });
}

/** Rappels à traiter — pool ordered by scheduled time. */
export async function rappelsPlanifies(limite = 50) {
  return db.callAttempt.findMany({
    where: { status: "RAPPEL", callbackAt: { not: null } },
    orderBy: { callbackAt: "asc" },
    take: limite,
    include: { respondent: true, agent: { select: { name: true } } },
  });
}
