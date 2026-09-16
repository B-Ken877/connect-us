"use server";

import { revalidatePath } from "next/cache";
import { AppError, versMessageUtilisateur, type CodeErreur } from "@/lib/errors";
import { exigerRole } from "@/lib/auth/session";
import { demarrerSessionAgent, changerEtatSession, battement } from "@/server/services/agent-session-service";
import { attribuerProchainRepondant } from "@/server/services/respondent-queue";
import { obtenirAppelActif, obtenirAppel, enregistrerResultatAppel } from "@/server/services/call-service";
import {
  demarrerEntretien,
  enregistrerReponse,
  soumettreEntretien,
  abandonnerEntretien,
  cloturerAppelSansEntretien,
  obtenirEntretienActif,
} from "@/server/services/interview-service";
import { schemaResultatAppel, schemaReponse } from "@/lib/validation/schemas";
import type { RoleUtilisateur } from "@/lib/auth/permissions";

export interface ResultatAction<T = undefined> {
  succes: boolean;
  message?: string;
  code?: CodeErreur;
  data?: T;
}

function erreur(cause: unknown): { succes: false; message: string; code?: CodeErreur } {
  console.error("[action-agent] Erreur:", cause);
  const code = cause instanceof AppError ? cause.code : "ERREUR_INTERNE";
  return { succes: false, message: versMessageUtilisateur(cause), code };
}

const ROLES_AGENT: RoleUtilisateur[] = ["AGENT", "ADMINISTRATEUR"];

export async function actionDemarrerSession(): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    await demarrerSessionAgent(utilisateur.id);
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionChangerEtat(
  statut: "DISPONIBLE" | "EN_PAUSE" | "HORS_LIGNE",
): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    await changerEtatSession(utilisateur.id, statut);
    revalidatePath("/session");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionBattement(): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    await battement(utilisateur.id);
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

/**
 * Requests the next respondent — the concurrency-critical entry point.
 *
 * CATI WORKFLOW (refactor): the queue atomically reserves the respondent,
 * creates the CallAttempt AND the Interview (pinned to the exact published
 * SurveyVersion) in one transaction, and returns the interviewId — the agent
 * lands directly in the interview workspace with the questionnaire ready.
 * An agent with work in progress always gets their own interview back.
 */
export async function actionAppelerSuivant(): Promise<
  ResultatAction<
    | { fileVide: true }
    | {
        interviewId: string;
        appelId: string;
        reprise: boolean;
        tentative: number;
        repondant: { nom: string; telephone: string; id: string };
      }
  >
> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    console.log("[actionAppelerSuivant] Agent:", utilisateur.id, utilisateur.name);
    const attribution = await attribuerProchainRepondant(utilisateur.id);
    console.log("[actionAppelerSuivant] Attribution:", attribution ? "OK" : "FILE VIDE");
    if (!attribution) return { succes: true, data: { fileVide: true } };

    revalidatePath("/session");
    return {
      succes: true,
      data: {
        interviewId: attribution.entretien.id,
        appelId: attribution.appel.id,
        reprise: attribution.reprise,
        tentative: attribution.appel.attemptNumber,
        repondant: {
          id: attribution.repondant.id,
          nom: attribution.repondant.name ?? "Répondant",
          telephone: attribution.repondant.phone,
        },
      },
    };
  } catch (e) {
    console.error("[actionAppelerSuivant] Erreur:", e);
    return erreur(e);
  }
}

export async function actionEnregistrerResultatAppel(params: {
  callAttemptId: string;
  statut: string;
  dureeSecondes?: number;
  notes?: string;
  rappelDate?: string;
  rappelHeure?: string;
}): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const parse = schemaResultatAppel.safeParse(params);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Résultat d'appel invalide.");
    }
    await enregistrerResultatAppel({
      agentId: utilisateur.id,
      callAttemptId: params.callAttemptId,
      donnees: {
        statut: parse.data.statut as never,
        dureeSecondes: parse.data.dureeSecondes,
        notes: parse.data.notes || undefined,
        rappelDate: parse.data.rappelDate,
        rappelHeure: parse.data.rappelHeure,
      },
    });
    revalidatePath("/session");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionObtenirAppelActif(): Promise<
  ResultatAction<{ appelId: string; telephone: string; nom: string; statut: string } | null>
> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const appel = await obtenirAppelActif(utilisateur.id);
    if (!appel) return { succes: true, data: null };
    return {
      succes: true,
      data: {
        appelId: appel.id,
        telephone: appel.respondent.phone,
        nom: appel.respondent.name ?? "Répondant",
        statut: appel.status,
      },
    };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionDemarrerEntretien(callAttemptId: string): Promise<
  ResultatAction<{ interviewId: string }>
> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const entretien = await demarrerEntretien({ agentId: utilisateur.id, callAttemptId });
    return { succes: true, data: { interviewId: entretien.id } };
  } catch (e) {
    return erreur(e);
  }
}

/**
 * Unified disposition WITHOUT a completed interview (no answer, busy,
 * refusal, wrong number, callback…). One server call closes the call attempt
 * with the real outcome and abandons the interview — the questionnaire is
 * never submitted as a completed political interview in this path.
 */
export async function actionCloturerSansEntretien(params: {
  interviewId: string;
  statut: string;
  dureeSecondes?: number;
  notes?: string;
  rappelDate?: string;
  rappelHeure?: string;
}): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const parse = schemaResultatAppel.safeParse(params);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Résultat d'appel invalide.");
    }
    if (parse.data.statut === "TERMINE") {
      throw new AppError(
        "VALIDATION",
        "Utilisez « Terminer l'entretien » pour enregistrer un entretien complété.",
      );
    }
    await cloturerAppelSansEntretien({
      agentId: utilisateur.id,
      interviewId: params.interviewId,
      statut: parse.data.statut as Exclude<(typeof parse.data)["statut"], "TERMINE">,
      dureeSecondes: parse.data.dureeSecondes,
      notes: parse.data.notes || undefined,
      rappelDate: parse.data.rappelDate,
      rappelHeure: parse.data.rappelHeure,
    });
    revalidatePath("/session");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

/** Dashboard resume shortcut: the agent's current interview, if any. */
export async function actionObtenirEntretienActif(): Promise<
  ResultatAction<{ interviewId: string; nom: string; telephone: string } | null>
> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const entretien = await obtenirEntretienActif(utilisateur.id);
    if (!entretien) return { succes: true, data: null };
    return {
      succes: true,
      data: {
        interviewId: entretien.id,
        nom: entretien.respondent.name ?? "Répondant",
        telephone: entretien.respondent.phone,
      },
    };
  } catch (e) {
    return erreur(e);
  }
}

/** Autosave of a single answer (called on every answer change, debounced). */
export async function actionEnregistrerReponse(params: {
  interviewId: string;
  questionKey: string;
  valeur: unknown;
}): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const parse = schemaReponse.safeParse(params);
    if (!parse.success) throw new AppError("VALIDATION", "Réponse invalide.");
    await enregistrerReponse({
      agentId: utilisateur.id,
      interviewId: params.interviewId,
      questionKey: params.questionKey,
      valeurBrute: params.valeur,
    });
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionSoumettreEntretien(params: {
  interviewId: string;
  reponses: Record<string, unknown>;
  notesAppel?: string;
}): Promise<ResultatAction<{ signalements: number; dureeSecondes: number }>> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const resultat = await soumettreEntretien({
      agentId: utilisateur.id,
      interviewId: params.interviewId,
      reponsesBrutes: params.reponses,
      notesAppel: params.notesAppel,
    });
    revalidatePath("/session");
    revalidatePath("/supervision");
    return {
      succes: true,
      data: { signalements: resultat.signalements, dureeSecondes: resultat.dureeSecondes },
    };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionAbandonnerEntretien(interviewId: string): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    await abandonnerEntretien({ agentId: utilisateur.id, interviewId });
    revalidatePath("/session");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

/** Ownership-verified call fetch (used by the call screen). */
export async function actionObtenirAppel(callAttemptId: string) {
  try {
    const utilisateur = await exigerRole(ROLES_AGENT);
    const appel = await obtenirAppel(utilisateur.id, callAttemptId);
    return { succes: true as const, data: appel };
  } catch (e) {
    return erreur(e);
  }
}
