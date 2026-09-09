import bcrypt from "bcryptjs";
import { config, estProduction } from "@/lib/config";

/**
 * Password hashing (bcrypt, cost 10) — passwords are never stored or logged
 * in plaintext anywhere in the application.
 */
export async function hasherMotDePasse(motDePasse: string): Promise<string> {
  return bcrypt.hash(motDePasse, 10);
}

export async function verifierMotDePasse(motDePasse: string, hash: string): Promise<boolean> {
  return bcrypt.compare(motDePasse, hash);
}

export function motDePasseValide(motDePasse: string): { ok: boolean; message?: string } {
  if (motDePasse.length < 8) {
    return { ok: false, message: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (!/[A-Za-z]/.test(motDePasse) || !/[0-9]/.test(motDePasse)) {
    return { ok: false, message: "Le mot de passe doit contenir des lettres et des chiffres." };
  }
  return { ok: true };
}

/** Session secret guard — refuse to run in production without a real secret. */
export function secretSession(): Uint8Array {
  if (estProduction() && !process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET doit être défini en production.");
  }
  return new TextEncoder().encode(config.auth.secret);
}
