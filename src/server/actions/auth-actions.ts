"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { AppError, versMessageUtilisateur } from "@/lib/errors";
import { creerSession, detruireSession, lireSession } from "@/lib/auth/session";
import { verifierMotDePasse } from "@/lib/auth/password";
import { schemaConnexion } from "@/lib/validation/schemas";
import { verifierLimite } from "@/lib/rate-limit";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";
import { ACCUEIL_PAR_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";

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
  redirect(ACCUEIL_PAR_ROLE[session!.role as RoleUtilisateur]);
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
