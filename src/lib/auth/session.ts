import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { config, estProduction } from "@/lib/config";
import {
  NOM_COOKIE,
  signerTokenSession,
  verifierTokenSession,
  type PayloadSession,
} from "@/lib/auth/session-core";
import { ACCUEIL_PAR_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";
import type { User } from "@prisma/client";

/**
 * Server-side session management: signed JWT in an HttpOnly cookie.
 * Secure flag in production (HTTPS on Vercel), SameSite=Lax, path=/.
 */

export async function creerSession(utilisateur: User): Promise<void> {
  const token = await signerTokenSession({
    sub: utilisateur.id,
    nom: utilisateur.name,
    role: utilisateur.role as RoleUtilisateur,
  });
  const store = await cookies();
  store.set(NOM_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: estProduction(),
    path: "/",
    maxAge: 60 * 60 * config.auth.heures,
  });
}

export async function detruireSession(): Promise<void> {
  const store = await cookies();
  store.delete(NOM_COOKIE);
}

/** Reads + verifies the session cookie (no DB access). */
export async function lireSession(): Promise<PayloadSession | null> {
  const store = await cookies();
  const token = store.get(NOM_COOKIE)?.value;
  if (!token) return null;
  return verifierTokenSession(token);
}

/**
 * Reads the session AND verifies the user still exists and is active.
 * Cached per request; used by sensitive server code paths.
 */
export const utilisateurCourant = cache(async (): Promise<User | null> => {
  const session = await lireSession();
  if (!session) return null;
  const utilisateur = await db.user.findUnique({ where: { id: session.sub } });
  if (!utilisateur || !utilisateur.active) return null;
  return utilisateur;
});

/**
 * Page-context guard: redirects to login when unauthenticated, to the role
 * home page when the role is not permitted. Returns the session payload.
 */
export async function exigerAcces(rolesAutorises?: RoleUtilisateur[]): Promise<PayloadSession> {
  const session = await lireSession();
  if (!session) redirect("/connexion?expiree=1");
  if (rolesAutorises && !rolesAutorises.includes(session.role)) {
    redirect(ACCUEIL_PAR_ROLE[session.role]);
  }
  return session;
}

/**
 * Action/handler-context guard: throws instead of redirecting (Server Actions
 * and Route Handlers must never silently redirect). Also verifies the account
 * is still active in the database (revocation takes effect immediately).
 */
export async function exigerRole(rolesAutorises?: RoleUtilisateur[]): Promise<User> {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) throw new AppError("SESSION_EXPIREE");
  if (rolesAutorises && !rolesAutorises.includes(utilisateur.role as RoleUtilisateur)) {
    throw new AppError("ACCES_REFUSE");
  }
  return utilisateur;
}
