"use server";

import { revalidatePath } from "next/cache";
import { versMessageUtilisateur, AppError, type CodeErreur } from "@/lib/errors";
import { exigerRole } from "@/lib/auth/session";
import { creerEnquete, creerNouvelleVersion, publierVersion, archiverVersion, majEnquete, creerQuestion, majQuestion, supprimerQuestion, dupliquerQuestion, reordonnerQuestions, majConfigVersion, majScriptEnquete, type DonneesQuestion } from "@/server/services/survey-service";
import { schemaEnquete, schemaQuestion } from "@/lib/validation/schemas";
import type { RoleUtilisateur } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";

export interface ResultatAction<T = undefined> {
  succes: boolean;
  message?: string;
  code?: CodeErreur;
  data?: T;
}

function erreur(cause: unknown): { succes: false; message: string; code?: CodeErreur } {
  console.error("[action] Erreur:", cause);
  const code = cause instanceof AppError ? cause.code : "ERREUR_INTERNE";
  return { succes: false, message: versMessageUtilisateur(cause), code };
}

const ROLES_GESTION: RoleUtilisateur[] = ["ADMINISTRATEUR"];

export async function actionCreerEnquete(formData: FormData): Promise<ResultatAction<{ id: string }>> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const parse = schemaEnquete.safeParse({
      titre: formData.get("titre"),
      description: formData.get("description") ?? "",
    });
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Formulaire invalide.");
    }
    const enquete = await creerEnquete({
      utilisateurId: utilisateur.id,
      titre: parse.data.titre,
      description: parse.data.description,
    });
    revalidatePath("/enquetes");
    return { succes: true, data: { id: enquete.id } };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionMajEnquete(params: {
  surveyId: string;
  titre?: string;
  description?: string;
}): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    await majEnquete({ utilisateurId: utilisateur.id, ...params });
    revalidatePath(`/enquetes/${params.surveyId}`);
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionCreerVersion(surveyId: string): Promise<ResultatAction<{ id: string }>> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const version = await creerNouvelleVersion({ utilisateurId: utilisateur.id, surveyId });
    revalidatePath(`/enquetes/${surveyId}`);
    return { succes: true, data: { id: version.id } };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionPublierVersion(versionId: string): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const version = await publierVersion({ utilisateurId: utilisateur.id, versionId });
    revalidatePath(`/enquetes/${version.surveyId}`);
    revalidatePath("/enquetes");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionArchiverVersion(versionId: string): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const version = await archiverVersion({ utilisateurId: utilisateur.id, versionId });
    revalidatePath(`/enquetes/${version.surveyId}`);
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionCreerQuestion(
  versionId: string,
  donnees: unknown,
): Promise<ResultatAction<{ id: string }>> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const parse = schemaQuestion.safeParse(donnees);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Question invalide.");
    }
    const question = await creerQuestion({
      utilisateurId: utilisateur.id,
      versionId,
      donnees: parse.data as DonneesQuestion,
    });
    revalidatePath(`/enquetes`);
    return { succes: true, data: { id: question.id } };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionMajQuestion(
  questionId: string,
  donnees: unknown,
): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const parse = schemaQuestion.safeParse(donnees);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Question invalide.");
    }
    await majQuestion({ utilisateurId: utilisateur.id, questionId, donnees: parse.data as DonneesQuestion });
    revalidatePath("/enquetes");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionSupprimerQuestion(questionId: string): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    await supprimerQuestion({ utilisateurId: utilisateur.id, questionId });
    revalidatePath("/enquetes");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionDupliquerQuestion(questionId: string): Promise<ResultatAction<{ id: string }>> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const copie = await dupliquerQuestion({ utilisateurId: utilisateur.id, questionId });
    revalidatePath("/enquetes");
    return { succes: true, data: { id: copie.id } };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionReordonnerQuestions(
  versionId: string,
  ordre: string[],
): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    await reordonnerQuestions({ utilisateurId: utilisateur.id, versionId, ordre });
    revalidatePath("/enquetes");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionMajConfigVersion(
  versionId: string,
  config: unknown,
): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    await majConfigVersion({ utilisateurId: utilisateur.id, versionId, config });
    revalidatePath("/enquetes");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

// ------------------- UNITED Research — script d'introduction -------------------

export async function actionMajScript(params: {
  enqueteId: string;
  openingScript: string;
  candidateName?: string;
  campaignInstructions?: string;
  complianceMessage?: string;
  contactInfo?: string;
}): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    if (!params.openingScript || params.openingScript.trim().length < 10) {
      throw new AppError("VALIDATION", "Le script d'introduction doit contenir au moins 10 caractères.");
    }
    await majScriptEnquete({
      utilisateurId: utilisateur.id,
      surveyId: params.enqueteId,
      openingScript: params.openingScript,
      candidateName: params.candidateName,
      campaignInstructions: params.campaignInstructions,
      complianceMessage: params.complianceMessage,
      contactInfo: params.contactInfo,
    });
    revalidatePath(`/enquetes/${params.enqueteId}`);
    revalidatePath("/session");
    return { succes: true, message: "Script d'introduction enregistré." };
  } catch (e) {
    return erreur(e);
  }
}

// ------------------- UNITED Research — statut campagne -------------------

export async function actionMajStatutEnquete(params: {
  enqueteId: string;
  statut: "BROUILLON" | "PUBLIEE" | "ARCHIVEE" | "EN_PAUSE" | "TERMINEE";
}): Promise<ResultatAction> {
  try {
    const utilisateur = await exigerRole(ROLES_GESTION);
    const enquete = await db.survey.findUnique({ where: { id: params.enqueteId } });
    if (!enquete) throw new AppError("INTROUVABLE", "Campagne introuvable.");

    await db.survey.update({
      where: { id: params.enqueteId },
      data: { status: params.statut, updatedById: utilisateur.id },
    });

    await enregistrerAudit({
      userId: utilisateur.id,
      action: ACTIONS_AUDIT.CAMPAGNE_MODIFIEE,
      entityType: "Survey",
      entityId: params.enqueteId,
      metadata: { ancienStatut: enquete.status, nouveauStatut: params.statut },
    });

    revalidatePath(`/enquetes/${params.enqueteId}`);
    revalidatePath("/enquetes");
    revalidatePath("/session");
    revalidatePath("/tableau-de-bord");
    return { succes: true, message: `Campagne marquée comme « ${libelleStatut(params.statut)} ».` };
  } catch (e) {
    return erreur(e);
  }
}

function libelleStatut(statut: string): string {
  const libelles: Record<string, string> = {
    BROUILLON: "Brouillon",
    PUBLIEE: "Active",
    ARCHIVEE: "Archivée",
    EN_PAUSE: "En pause",
    TERMINEE: "Terminée",
  };
  return libelles[statut] ?? statut;
}
