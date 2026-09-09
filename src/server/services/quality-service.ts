import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";

/**
 * QUALITY REVIEW SERVICE — supervisors examine flags; collected data is
 * NEVER deleted or rewritten by this engine. Review decisions keep an
 * audit trail.
 */

export async function listerSignalements(filtre: { statut?: string; type?: string }) {
  return db.qualityFlag.findMany({
    where: {
      ...(filtre.statut && filtre.statut !== "TOUS" ? { status: filtre.statut as never } : {}),
      ...(filtre.type && filtre.type !== "TOUS" ? { type: filtre.type as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      interview: {
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
          durationSeconds: true,
          status: true,
          surveyVersion: {
            select: { versionNumber: true, survey: { select: { title: true } } },
          },
        },
      },
      agent: { select: { id: true, name: true } },
    },
  });
}

export async function examinerSignalement(params: {
  superviseurId: string;
  signalementId: string;
  statut: "A_EXAMINER" | "VALIDE" | "REJETE" | "FAUX_POSITIF";
  commentaire?: string;
}) {
  const signalement = await db.qualityFlag.findUnique({ where: { id: params.signalementId } });
  if (!signalement) throw new AppError("INTROUVABLE", "Signalement introuvable.");

  const [misAJour] = await db.$transaction([
    db.qualityFlag.update({
      where: { id: signalement.id },
      data: {
        status: params.statut,
        reviewedById: params.superviseurId,
        reviewedAt: new Date(),
        reviewComment: params.commentaire || null,
      },
    }),
    // Mirror the decision on the interview quality status.
    ...(signalement.interviewId
      ? [
          db.interview.update({
            where: { id: signalement.interviewId },
            data: { qualityStatus: params.statut },
          }),
        ]
      : []),
  ]);

  await enregistrerAudit({
    userId: params.superviseurId,
    action: ACTIONS_AUDIT.SIGNALEMENT_EXAMINE,
    entityType: "QualityFlag",
    entityId: signalement.id,
    metadata: { statut: params.statut, type: signalement.type },
  });
  return misAJour;
}
