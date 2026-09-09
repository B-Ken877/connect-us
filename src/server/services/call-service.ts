import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { marquerEtatActivite } from "@/server/services/agent-session-service";
import { enregistrerAudit } from "@/lib/audit";
import type { StatutAppel } from "@prisma/client";

/**
 * CALL LIFECYCLE — outcome recording & callback scheduling.
 * The dialing itself goes through the DialerProvider abstraction (client side
 * for V1) — this service only manages platform state around the call.
 */

export interface DonneesResultatAppel {
  statut: Exclude<StatutAppel, "EN_COURS">;
  dureeSecondes?: number;
  notes?: string;
  rappelDate?: string; // yyyy-mm-dd
  rappelHeure?: string; // HH:mm
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

export async function enregistrerResultatAppel(params: {
  agentId: string;
  callAttemptId: string;
  donnees: DonneesResultatAppel;
}) {
  const { agentId, callAttemptId, donnees } = params;

  let rappelPrevuA: Date | null = null;
  if (donnees.statut === "RAPPEL") {
    const combinee = new Date(`${donnees.rappelDate}T${donnees.rappelHeure}:00`);
    if (Number.isNaN(combinee.getTime())) {
      throw new AppError("VALIDATION", "La date ou l'heure de rappel saisie n'est pas valide.");
    }
    if (combinee.getTime() < Date.now() - 60_000) {
      throw new AppError("VALIDATION", "La date de rappel doit être dans le futur.");
    }
    rappelPrevuA = combinee;
  }

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
    const duree =
      donnees.dureeSecondes !== undefined
        ? donnees.dureeSecondes
        : Math.max(0, Math.floor((maintenant.getTime() - appel.startedAt.getTime()) / 1000));
    const echeanceVerrou = new Date(maintenant.getTime() + 120 * 60_000); // refreshed by queue resume flow

    let statutRepondant: "DISPONIBLE" | "EN_COURS" | "RAPPEL_PLANIFIE" | "EXCLU";
    switch (donnees.statut) {
      case "TERMINE":
        statutRepondant = "EN_COURS"; // stays owned by the agent for the interview
        break;
      case "RAPPEL":
        statutRepondant = "RAPPEL_PLANIFIE";
        break;
      case "REFUS":
      case "NUMERO_INCORRECT":
        statutRepondant = "EXCLU";
        break;
      default: // SANS_REPONSE / OCCUPE / ABANDONNE
        statutRepondant = "DISPONIBLE";
        break;
    }

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
        assignedToId: statutRepondant === "EN_COURS" ? agentId : null,
        assignedAt: statutRepondant === "EN_COURS" ? maintenant : null,
        lockExpiresAt: statutRepondant === "EN_COURS" ? echeanceVerrou : null,
      },
    });

    if (statutRepondant !== "EN_COURS") {
      await marquerEtatActivite(agentId, "DISPONIBLE");
    }

    return { appelId: appel.id, statutRepondant, rappelPrevuA };
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
