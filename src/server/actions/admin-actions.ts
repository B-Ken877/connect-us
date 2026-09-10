"use server";

import { revalidatePath } from "next/cache";
import { AppError, versMessageUtilisateur, type CodeErreur } from "@/lib/errors";
import { exigerRole } from "@/lib/auth/session";
import { creerUtilisateur, majUtilisateur } from "@/server/services/user-service";
import { creerRepondant, majRepondant, importerRepondants } from "@/server/services/respondent-service";
import { examinerSignalement } from "@/server/services/quality-service";
import { schemaUtilisateur, schemaRepondant, schemaExamenSignalement } from "@/lib/validation/schemas";
import type { RoleUtilisateur } from "@/lib/auth/permissions";

export interface ResultatAction<T = undefined> {
  succes: boolean;
  message?: string;
  code?: CodeErreur;
  data?: T;
}

function erreur(cause: unknown): { succes: false; message: string; code?: CodeErreur } {
  console.error("[action-admin] Erreur:", cause);
  const code = cause instanceof AppError ? cause.code : "ERREUR_INTERNE";
  return { succes: false, message: versMessageUtilisateur(cause), code };
}

// ----------------------------- Users (admin) -----------------------------

export async function actionCreerUtilisateur(donnees: unknown): Promise<ResultatAction<{ id: string }>> {
  try {
    const acteur = await exigerRole(["ADMINISTRATEUR"]);
    const parse = schemaUtilisateur.safeParse(donnees);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Formulaire invalide.");
    }
    if (!parse.data.motDePasse) throw new AppError("VALIDATION", "Le mot de passe est requis.");
    const utilisateur = await creerUtilisateur({
      acteurId: acteur.id,
      name: parse.data.name,
      email: parse.data.email,
      role: parse.data.role,
      motDePasse: parse.data.motDePasse,
    });
    revalidatePath("/agents");
    return { succes: true, data: { id: utilisateur.id } };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionMajUtilisateur(
  utilisateurId: string,
  donnees: unknown,
): Promise<ResultatAction> {
  try {
    const acteur = await exigerRole(["ADMINISTRATEUR"]);
    const parse = schemaUtilisateur.partial().safeParse(donnees);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Formulaire invalide.");
    }
    await majUtilisateur({
      acteurId: acteur.id,
      utilisateurId,
      name: parse.data.name,
      role: parse.data.role,
      motDePasse: parse.data.motDePasse || undefined,
      active: parse.data.active,
    });
    revalidatePath("/agents");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

// --------------------------- Respondents (pool) ---------------------------

const ROLES_RESPONDANTS: RoleUtilisateur[] = ["ADMINISTRATEUR"];

export async function actionCreerRepondant(donnees: unknown): Promise<ResultatAction<{ id: string }>> {
  try {
    const acteur = await exigerRole(ROLES_RESPONDANTS);
    const parse = schemaRepondant.safeParse(donnees);
    if (!parse.success) {
      throw new AppError("VALIDATION", parse.error.issues[0]?.message ?? "Formulaire invalide.");
    }
    const repondant = await creerRepondant({
      acteurId: acteur.id,
      externalRef: parse.data.externalRef || undefined,
      name: parse.data.name || undefined,
      phone: parse.data.phone,
      metadata: parse.data.metadata as Record<string, unknown> | undefined,
    });
    revalidatePath("/repondants");
    return { succes: true, data: { id: repondant.id } };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionMajRepondant(
  repondantId: string,
  donnees: { name?: string; phone?: string; status?: "DISPONIBLE" | "INJOIGNABLE" | "EXCLU" },
): Promise<ResultatAction> {
  try {
    const acteur = await exigerRole(ROLES_RESPONDANTS);
    await majRepondant({ acteurId: acteur.id, repondantId, ...donnees });
    revalidatePath("/repondants");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}

export async function actionImporterRepondants(contenu: string): Promise<
  ResultatAction<{ soumis: number; crees: number }>
> {
  try {
    const acteur = await exigerRole(["ADMINISTRATEUR"]);
    const resultat = await importerRepondants({ acteurId: acteur.id, contenu });
    revalidatePath("/repondants");
    return { succes: true, data: resultat };
  } catch (e) {
    return erreur(e);
  }
}

// ------------------------------ Quality review ------------------------------

export async function actionExaminerSignalement(params: {
  signalementId: string;
  statut: string;
  commentaire?: string;
}): Promise<ResultatAction> {
  try {
    const examinateur = await exigerRole(["ADMINISTRATEUR"]);
    const parse = schemaExamenSignalement.safeParse(params);
    if (!parse.success) throw new AppError("VALIDATION", "Examen invalide.");
    await examinerSignalement({
      superviseurId: examinateur.id,
      signalementId: parse.data.signalementId,
      statut: parse.data.statut,
      commentaire: parse.data.commentaire || undefined,
    });
    revalidatePath("/controle-qualite");
    revalidatePath("/supervision");
    return { succes: true };
  } catch (e) {
    return erreur(e);
  }
}
