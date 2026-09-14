"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { AppError, versMessageUtilisateur } from "@/lib/errors";
import { creerSession, detruireSession, lireSession } from "@/lib/auth/session";
import { verifierMotDePasse, hasherMotDePasse, motDePasseValide } from "@/lib/auth/password";
import { schemaConnexion } from "@/lib/validation/schemas";
import { verifierLimite } from "@/lib/rate-limit";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";
import { ACCUEIL_PAR_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";
import { verifierAccesShift } from "@/lib/shifts";
import { verifierIp } from "@/lib/ip-restriction";

export interface ResultatAction<T = undefined> {
  succes: boolean;
  message?: string;
  data?: T;
}

/**
 * Login — Server Action (POST-like, CSRF-safe via Next.js origin checks).
 * Rate limited per IP; failures are audited; success creates an HttpOnly
 * signed session cookie and redirects to the role home page.
 */
export async function seConnecter(
  _etatPrecedent: ResultatAction | null,
  formData: FormData,
): Promise<ResultatAction> {
  const parse = schemaConnexion.safeParse({
    email: formData.get("email"),
    motDePasse: formData.get("motDePasse"),
  });
  if (!parse.success) {
    return { succes: false, message: "Veuillez saisir votre identifiant et votre mot de passe." };
  }

  const entetes = await headers();
  const ip = entetes.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  const limite = verifierLimite(`connexion:${ip}`, 10, 5 * 60_000);
  if (!limite.autorise) {
    return {
      succes: false,
      message: `Trop de tentatives de connexion. Veuillez réessayer dans ${Math.ceil(minutesRestantes(limite.restantMs))} minute(s).`,
    };
  }

  try {
    const utilisateur = await db.user.findUnique({
      where: { email: parse.data.email.toLowerCase() },
    });
    const motDePasseOk =
      utilisateur && utilisateur.active
        ? await verifierMotDePasse(parse.data.motDePasse, utilisateur.passwordHash)
        : false;

    if (!utilisateur || !motDePasseOk) {
      await enregistrerAudit({
        userId: utilisateur?.id ?? null,
        action: ACTIONS_AUDIT.ECHEC_CONNEXION,
        entityType: "User",
        metadata: { email: parse.data.email, ip },
      });
      return { succes: false, message: "Identifiant ou mot de passe incorrect." };
    }

    // UNITED Research — vérification du shift de l'agent.
    // L'agent ne peut se connecter QUE pendant son shift (08:00-13:55 ou 14:00-20:00 EST).
    // Les administrateurs ne sont pas soumis à cette règle.
    const verifShift = verifierAccesShift(utilisateur.name, utilisateur.role);
    if (!verifShift.autorise) {
      await enregistrerAudit({
        userId: utilisateur.id,
        action: "CONNEXION_HORS_SHIFT",
        entityType: "User",
        entityId: utilisateur.id,
        metadata: { email: parse.data.email, ip, shift: verifShift.shift?.id },
      });
      return {
        succes: false,
        message: verifShift.message ?? "Vous ne pouvez pas vous connecter en dehors de votre shift.",
      };
    }

    // UNITED Research — vérification de la restriction IP.
    // Si l'admin a défini une IP spécifique pour ce compte, on vérifie l'IP de la requête.
    const verifIp = verifierIp(ip, {
      ipRestrictionMode: utilisateur.ipRestrictionMode,
      ipRestriction: utilisateur.ipRestriction,
    });
    if (!verifIp.autorise) {
      await enregistrerAudit({
        userId: utilisateur.id,
        action: "CONNEXION_IP_REFUSEE",
        entityType: "User",
        entityId: utilisateur.id,
        metadata: { email: parse.data.email, ip, ipAutorisee: utilisateur.ipRestriction },
      });
      return {
        succes: false,
        message: verifIp.message ?? "Connexion refusée : adresse IP non autorisée.",
      };
    }

    // Mise à jour de la dernière connexion (pour le tableau de bord admin).
    await db.user.update({
      where: { id: utilisateur.id },
      data: { lastLoginAt: new Date() },
    }).catch(() => { /* best-effort — login must succeed even if this fails */ });

    await creerSession(utilisateur);
    await enregistrerAudit({
      userId: utilisateur.id,
      action: ACTIONS_AUDIT.CONNEXION,
      entityType: "User",
      entityId: utilisateur.id,
      metadata: { ip },
    });
  } catch (erreur) {
    console.error("[auth] Erreur de connexion:", erreur);
    return { succes: false, message: versMessageUtilisateur(erreur) };
  }

  const session = await lireSession();
  // Si l'utilisateur doit changer son mot de passe (compte créé en masse ou
  // reset admin), on le redirige vers l'écran de changement obligatoire.
  const utilisateurFinal = await db.user.findUnique({
    where: { id: session!.sub },
    select: { mustChangePassword: true },
  });
  if (utilisateurFinal?.mustChangePassword) {
    redirect("/changer-mot-de-passe");
  }
  redirect(ACCUEIL_PAR_ROLE[session!.role as RoleUtilisateur]);
}

/**
 * Changement de mot de passe obligatoire (première connexion ou reset admin).
 * L'utilisateur doit saisir son mot de passe actuel + le nouveau deux fois.
 * Le flag mustChangePassword est effacé après succès.
 */
export async function changerMonMotDePasse(
  _etatPrecedent: ResultatAction | null,
  formData: FormData,
): Promise<ResultatAction> {
  const session = await lireSession();
  if (!session) {
    return { succes: false, message: "Votre session a expiré. Veuillez vous reconnecter." };
  }

  const motDePasseActuel = String(formData.get("motDePasseActuel") ?? "");
  const nouveauMotDePasse = String(formData.get("nouveauMotDePasse") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (nouveauMotDePasse !== confirmation) {
    return { succes: false, message: "Le nouveau mot de passe et sa confirmation ne correspondent pas." };
  }

  const validation = motDePasseValide(nouveauMotDePasse);
  if (!validation.ok) {
    return { succes: false, message: validation.message };
  }

  try {
    const utilisateur = await db.user.findUnique({ where: { id: session.sub } });
    if (!utilisateur || !utilisateur.active) {
      return { succes: false, message: "Compte introuvable ou désactivé." };
    }

    // Vérifier l'ancien mot de passe (sauf si mustChangePassword=true, auquel
    // cas l'ancien est le mot de passe temporaire — on vérifie quand même).
    const ancienOk = await verifierMotDePasse(motDePasseActuel, utilisateur.passwordHash);
    if (!ancienOk) {
      return { succes: false, message: "Le mot de passe actuel est incorrect." };
    }

    const nouveauHash = await hasherMotDePasse(nouveauMotDePasse);
    await db.user.update({
      where: { id: utilisateur.id },
      data: {
        passwordHash: nouveauHash,
        mustChangePassword: false,
      },
    });

    await enregistrerAudit({
      userId: utilisateur.id,
      action: ACTIONS_AUDIT.MOT_DE_PASSE_CHANGE,
      entityType: "User",
      entityId: utilisateur.id,
    });

    return {
      succes: true,
      message: "Votre mot de passe a été modifié avec succès.",
    };
  } catch (erreur) {
    console.error("[auth] Erreur changement mot de passe:", erreur);
    return { succes: false, message: versMessageUtilisateur(erreur) };
  }
}

function minutesRestantes(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

export async function seDeconnecter(): Promise<void> {
  const session = await lireSession();
  if (session) {
    await enregistrerAudit({
      userId: session.sub,
      action: ACTIONS_AUDIT.DECONNEXION,
      entityType: "User",
      entityId: session.sub,
    });
  }
  await detruireSession();
  redirect("/connexion");
}

export async function quitterSession(): Promise<void> {
  try {
    await db.agentSession.updateMany({
      where: { agentId: (await lireSession())?.sub ?? "", endedAt: null },
      data: { status: "HORS_LIGNE", endedAt: new Date() },
    });
  } catch {
    // best effort — logout must always succeed
  }
  await seDeconnecter();
}
