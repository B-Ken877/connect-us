import { SignJWT, jwtVerify } from "jose";
import { config } from "@/lib/config";
import { secretSession } from "@/lib/auth/password";
import type { RoleUtilisateur } from "@/lib/auth/permissions";

/**
 * Session JWT core — edge-compatible (jose only, no node APIs, no DB).
 * Used by middleware (verification) and by the server session helpers
 * (creation via next/headers cookies).
 */

export interface PayloadSession {
  sub: string; // user id
  nom: string;
  role: RoleUtilisateur;
}

export const NOM_COOKIE = config.auth.cookieName;

export async function signerTokenSession(payload: PayloadSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nom: payload.nom, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + config.auth.heures * 3600)
    .sign(secretSession());
}

export async function verifierTokenSession(token: string): Promise<PayloadSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretSession(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.nom !== "string" || typeof payload.role !== "string") {
      return null;
    }
    const role = payload.role as RoleUtilisateur;
    if (!["ADMINISTRATEUR", "AGENT"].includes(role)) return null;
    return { sub: payload.sub, nom: payload.nom, role };
  } catch {
    return null;
  }
}
