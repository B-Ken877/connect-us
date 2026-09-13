import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";
import { hasherMotDePasse, motDePasseValide } from "@/lib/auth/password";
import type { Role } from "@prisma/client";

/** User administration (ADMINISTRATEUR only). */

export async function listerUtilisateurs() {
  return db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
    },
  });
}

export async function creerUtilisateur(params: {
  acteurId: string;
  name: string;
  email: string;
  role: Role;
  motDePasse: string;
}) {
  const verif = motDePasseValide(params.motDePasse);
  if (!verif.ok) throw new AppError("VALIDATION", verif.message);

  const existe = await db.user.findUnique({ where: { email: params.email.toLowerCase() } });
  if (existe) throw new AppError("CONFLIT", "Un compte avec cette adresse e-mail existe déjà.");

  const utilisateur = await db.user.create({
    data: {
      name: params.name,
      email: params.email.toLowerCase(),
      role: params.role,
      passwordHash: await hasherMotDePasse(params.motDePasse),
      active: true,
    },
  });
  await enregistrerAudit({
    userId: params.acteurId,
    action: ACTIONS_AUDIT.UTILISATEUR_CREE,
    entityType: "User",
    entityId: utilisateur.id,
    metadata: { role: params.role },
  });
  return utilisateur;
}

export async function majUtilisateur(params: {
  acteurId: string;
  utilisateurId: string;
  name?: string;
  role?: Role;
  motDePasse?: string;
  active?: boolean;
}) {
  const cible = await db.user.findUnique({ where: { id: params.utilisateurId } });
  if (!cible) throw new AppError("INTROUVABLE", "Compte introuvable.");

  const data: Record<string, unknown> = {};
  if (params.name !== undefined) data.name = params.name;
  if (params.motDePasse) {
    const verif = motDePasseValide(params.motDePasse);
    if (!verif.ok) throw new AppError("VALIDATION", verif.message);
    data.passwordHash = await hasherMotDePasse(params.motDePasse);
  }

  if (params.role !== undefined && params.role !== cible.role) {
    // Never demote/deactivate the last active administrator.
    if (cible.role === "ADMINISTRATEUR") {
      const adminsActifs = await db.user.count({ where: { role: "ADMINISTRATEUR", active: true } });
      if (adminsActifs <= 1) {
        throw new AppError("ETAT_INVALIDE", "Impossible de retirer le dernier administrateur actif.");
      }
    }
    data.role = params.role;
    await enregistrerAudit({
      userId: params.acteurId,
      action: ACTIONS_AUDIT.ROLE_MODIFIE,
      entityType: "User",
      entityId: cible.id,
      metadata: { ancienRole: cible.role, nouveauRole: params.role },
    });
  }

  if (params.active !== undefined && params.active !== cible.active) {
    if (!params.active) {
      if (cible.id === params.acteurId) {
        throw new AppError("ETAT_INVALIDE", "Vous ne pouvez pas désactiver votre propre compte.");
      }
      if (cible.role === "ADMINISTRATEUR") {
        const adminsActifs = await db.user.count({ where: { role: "ADMINISTRATEUR", active: true } });
        if (adminsActifs <= 1) {
          throw new AppError("ETAT_INVALIDE", "Impossible de désactiver le dernier administrateur actif.");
        }
      }
    }
    data.active = params.active;
    await enregistrerAudit({
      userId: params.acteurId,
      action: params.active ? ACTIONS_AUDIT.COMPTE_REACTIVE : ACTIONS_AUDIT.COMPTE_DESACTIVE,
      entityType: "User",
      entityId: cible.id,
    });
  }

  return db.user.update({ where: { id: params.utilisateurId }, data });
}
