"use server";

import { revalidatePath } from "next/cache";
import { AppError, versMessageUtilisateur, type CodeErreur } from "@/lib/errors";
import { exigerRole } from "@/lib/auth/session";
import { creerUtilisateur, majUtilisateur } from "@/server/services/user-service";
import { creerRepondant, majRepondant, importerRepondants } from "@/server/services/respondent-service";
import { examinerSignalement } from "@/server/services/quality-service";
import { schemaUtilisateur, schemaRepondant, schemaExamenSignalement } from "@/lib/validation/schemas";
import type { RoleUtilisateur } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { hasherMotDePasse, motDePasseValide } from "@/lib/auth/password";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";

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
    // UNITED Research — accepter les champs de restriction IP (non dans schemaUtilisateur).
    const donneesBrutes = donnees as Record<string, unknown>;
    const ipRestrictionMode = donneesBrutes.ipRestrictionMode === "SPECIFIC" ? "SPECIFIC" : "ANY";
    const ipRestriction = typeof donneesBrutes.ipRestriction === "string"
      ? (donneesBrutes.ipRestriction as string).trim() || null
      : null;

    await majUtilisateur({
      acteurId: acteur.id,
      utilisateurId,
      name: parse.data.name,
      role: parse.data.role,
      motDePasse: parse.data.motDePasse || undefined,
      active: parse.data.active,
      ipRestrictionMode,
      ipRestriction,
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

// ------------------- UNITED Research — agents en masse -------------------

export interface AgentCreeEnMasse {
  username: string;
  email: string;
  motDePasseTemporaire: string;
}

/**
 * Crée N comptes agents en masse avec un mot de passe temporaire partagé.
 * Tous les comptes sont marqués mustChangePassword=true.
 * Retourne la liste des identifiants créés (mot de passe affiché UNE SEULE FOIS).
 */
export async function actionCreerAgentsEnMasse(params: {
  prefixe: string;        // ex: "agent"
  nombre: number;         // ex: 100
  domaine: string;        // ex: "united-research.ht"
  motDePasseTemporaire: string;
}): Promise<ResultatAction<{ agents: AgentCreeEnMasse[]; crees: number }>> {
  try {
    const acteur = await exigerRole(["ADMINISTRATEUR"]);

    // Validation
    if (!params.prefixe || params.prefixe.length < 2) {
      throw new AppError("VALIDATION", "Le préfixe doit contenir au moins 2 caractères.");
    }
    if (!Number.isInteger(params.nombre) || params.nombre < 1 || params.nombre > 500) {
      throw new AppError("VALIDATION", "Le nombre d'agents doit être entre 1 et 500.");
    }
    if (!params.domaine || !params.domaine.includes(".")) {
      throw new AppError("VALIDATION", "Le domaine est invalide.");
    }
    const validationMdp = motDePasseValide(params.motDePasseTemporaire);
    if (!validationMdp.ok) {
      throw new AppError("VALIDATION", validationMdp.message ?? "Mot de passe temporaire invalide.");
    }

    // Générer la liste des usernames (agent001, agent002, ...)
    const usernames: string[] = [];
    const largeur = Math.max(3, String(params.nombre).length);
    for (let i = 1; i <= params.nombre; i++) {
      usernames.push(`${params.prefixe}${String(i).padStart(largeur, "0")}`);
    }

    // Vérifier les doublons existants en une seule requête
    const existants = await db.user.findMany({
      where: { email: { in: usernames.map((u) => `${u}@${params.domaine}`) } },
      select: { email: true },
    });
    const emailsExistants = new Set(existants.map((u) => u.email));
    if (emailsExistants.size > 0) {
      const exemples = Array.from(emailsExistants).slice(0, 3).join(", ");
      throw new AppError(
        "CONFLIT",
        `${emailsExistants.size} compte(s) existent déjà avec ces identifiants (ex: ${exemples}).`,
      );
    }

    // Hacher le mot de passe une seule fois (partagé)
    const hash = await hasherMotDePasse(params.motDePasseTemporaire);

    // Créer tous les comptes en une transaction
    const agents: AgentCreeEnMasse[] = [];
    await db.$transaction(
      usernames.map((username) =>
        db.user.create({
          data: {
            name: username,
            email: `${username}@${params.domaine}`,
            passwordHash: hash,
            role: "AGENT",
            active: true,
            mustChangePassword: true,
          },
        }),
      ),
    );

    for (const username of usernames) {
      agents.push({
        username,
        email: `${username}@${params.domaine}`,
        motDePasseTemporaire: params.motDePasseTemporaire,
      });
    }

    await enregistrerAudit({
      userId: acteur.id,
      action: ACTIONS_AUDIT.AGENTS_CREE_EN_MASSE,
      entityType: "User",
      metadata: { nombre: agents.length, prefixe: params.prefixe, domaine: params.domaine },
    });

    revalidatePath("/agents");
    return { succes: true, data: { agents, crees: agents.length } };
  } catch (e) {
    return erreur(e);
  }
}

/**
 * Réinitialise le mot de passe d'un agent.
 * Définit un nouveau mot de passe temporaire + mustChangePassword=true.
 * Retourne le mot de passe temporaire (affiché UNE SEULE FOIS à l'admin).
 */
export async function actionReinitialiserMotDePasse(
  utilisateurId: string,
): Promise<ResultatAction<{ motDePasseTemporaire: string }>> {
  try {
    const acteur = await exigerRole(["ADMINISTRATEUR"]);

    const utilisateur = await db.user.findUnique({ where: { id: utilisateurId } });
    if (!utilisateur) throw new AppError("INTROUVABLE", "Utilisateur introuvable.");
    if (utilisateur.role !== "AGENT") {
      throw new AppError("ACCES_REFUSE", "Seuls les comptes agents peuvent être réinitialisés.");
    }

    // Générer un mot de passe temporaire aléatoire sécurisé
    const motDePasseTemporaire = genererMotDePasseAleatoire();
    const hash = await hasherMotDePasse(motDePasseTemporaire);

    await db.user.update({
      where: { id: utilisateurId },
      data: {
        passwordHash: hash,
        mustChangePassword: true,
      },
    });

    await enregistrerAudit({
      userId: acteur.id,
      action: ACTIONS_AUDIT.MOT_DE_PASSE_REINITIALISE,
      entityType: "User",
      entityId: utilisateurId,
      metadata: { cible: utilisateur.email },
    });

    revalidatePath("/agents");
    return { succes: true, data: { motDePasseTemporaire } };
  } catch (e) {
    return erreur(e);
  }
}

/** Génère un mot de passe aléatoire de 12 caractères (lettres + chiffres). */
function genererMotDePasseAleatoire(): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let resultat = "";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 12; i++) {
    resultat += charset[bytes[i] % charset.length];
  }
  return resultat;
}
