import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Audit trail for sensitive actions. Fire-and-forget: audit failures must
 * never break the user operation, but they are logged server-side.
 */
export async function enregistrerAudit(entree: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entree.userId ?? null,
        action: entree.action,
        entityType: entree.entityType,
        entityId: entree.entityId ?? null,
        metadata: entree.metadata
          ? (entree.metadata as Prisma.InputJsonValue)
          : undefined,
      },
    });
  } catch (erreur) {
    console.error("[audit] Échec d'écriture du journal d'audit:", erreur);
  }
}

/** Vocabulary of audited actions (kept in one place for consistency). */
export const ACTIONS_AUDIT = {
  CONNEXION: "CONNEXION",
  ECHEC_CONNEXION: "ECHEC_CONNEXION",
  DECONNEXION: "DECONNEXION",
  ENQUETE_CREEE: "ENQUETE_CREEE",
  ENQUETE_MODIFIEE: "ENQUETE_MODIFIEE",
  ENQUETE_PUBLIEE: "ENQUETE_PUBLIEE",
  ENQUETE_ARCHIVEE: "ENQUETE_ARCHIVEE",
  VERSION_CREEE: "VERSION_CREEE",
  RESPONDANT_CREE: "RESPONDANT_CREE",
  RESPONDANT_MODIFIE: "RESPONDANT_MODIFIE",
  RESPONDANT_EXCLU: "RESPONDANT_EXCLU",
  ENTRETIEN_CONSULTE: "ENTRETIEN_CONSULTE",
  ENTRETIEN_ABANDONNE: "ENTRETIEN_ABANDONNE",
  SIGNALEMENT_EXAMINE: "SIGNALEMENT_EXAMINE",
  EXPORT_REPONSES: "EXPORT_REPONSES",
  UTILISATEUR_CREE: "UTILISATEUR_CREE",
  UTILISATEUR_MODIFIE: "UTILISATEUR_MODIFIE",
  UTILISATEUR_DESACTIVE: "UTILISATEUR_DESACTIVE",
  UTILISATEUR_REACTIVE: "UTILISATEUR_REACTIVE",
  ROLE_MODIFIE: "ROLE_MODIFIE",
  COMPTE_DESACTIVE: "COMPTE_DESACTIVE",
  COMPTE_REACTIVE: "COMPTE_REACTIVE",
  // ---- Extensions UNITED Research ----
  MOT_DE_PASSE_CHANGE: "MOT_DE_PASSE_CHANGE",
  MOT_DE_PASSE_REINITIALISE: "MOT_DE_PASSE_REINITIALISE",
  AGENTS_CREE_EN_MASSE: "AGENTS_CREE_EN_MASSE",
  SCRIPT_MODIFIE: "SCRIPT_MODIFIE",
  CAMPAGNE_MODIFIEE: "CAMPAGNE_MODIFIEE",
  CONTACT_OPT_OUT: "CONTACT_OPT_OUT",
} as const;
