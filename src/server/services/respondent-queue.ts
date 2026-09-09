import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import type { CallAttempt, Interview, Respondent } from "@prisma/client";

/**
 * RESPONDENT QUEUE — concurrency-safe assignment.
 *
 * Guarantees (enforced at the DATABASE level, not merely client state):
 *  - Two agents can NEVER receive the same respondent simultaneously:
 *    selection uses SELECT … FOR UPDATE SKIP LOCKED inside a transaction.
 *  - A respondent being handled (status EN_COURS, fresh lock) is invisible to
 *    other agents.
 *  - Stale locks (agent closed their browser mid-call or mid-interview) are
 *    auto-released after ASSIGNMENT_LOCK_MINUTES.
 *  - A respondent with >= maxTentatives call attempts is parked INJOIGNABLE.
 *  - An agent always resumes their own in-progress call OR in-progress
 *    interview (page refresh / reconnect safe).
 */

export type EtapeReprise = "APPEL" | "ENTRETIEN";

export interface AttributionRepondant {
  reprise: boolean;
  etape: EtapeReprise;
  appel?: CallAttempt;
  entretien?: Interview;
  repondant: Respondent;
}

function nouvelleEcheanceVerrou(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + config.file.verrouMinutes * 60_000);
}

export async function attribuerProchainRepondant(agentId: string): Promise<AttributionRepondant | null> {
  return db.$transaction(async (tx) => {
    const maintenant = new Date();

    // 1. Release stale locks (agent vanished mid-call / mid-interview).
    await tx.respondent.updateMany({
      where: { status: "EN_COURS", lockExpiresAt: { lt: maintenant } },
      data: { status: "DISPONIBLE", assignedToId: null, assignedAt: null, lockExpiresAt: null },
    });

    // 2a. Resume the agent's own in-progress call (pre-outcome).
    const appelEnCours = await tx.callAttempt.findFirst({
      where: { agentId, status: "EN_COURS" },
      include: { respondent: true },
    });
    if (appelEnCours) {
      await tx.respondent.update({
        where: { id: appelEnCours.respondentId },
        data: { assignedToId: agentId, assignedAt: maintenant, lockExpiresAt: nouvelleEcheanceVerrou(maintenant), status: "EN_COURS" },
      });
      return { reprise: true, etape: "APPEL" as const, appel: appelEnCours, repondant: appelEnCours.respondent };
    }

    // 2b. Resume the agent's own in-progress interview.
    const entretienEnCours = await tx.interview.findFirst({
      where: { agentId, status: "EN_COURS" },
      include: { respondent: true, callAttempt: true },
      orderBy: { startedAt: "desc" },
    });
    if (entretienEnCours) {
      await tx.respondent.update({
        where: { id: entretienEnCours.respondentId },
        data: { assignedToId: agentId, assignedAt: maintenant, lockExpiresAt: nouvelleEcheanceVerrou(maintenant), status: "EN_COURS" },
      });
      return {
        reprise: true,
        etape: "ENTRETIEN" as const,
        entretien: entretienEnCours,
        appel: entretienEnCours.callAttempt ?? undefined,
        repondant: entretienEnCours.respondent,
      };
    }

    // 3. Park respondents that exhausted their attempts.
    await tx.$executeRaw`
      UPDATE "Respondent" r
      SET "status" = 'INJOIGNABLE', "updatedAt" = ${maintenant}
      WHERE r."status" = 'DISPONIBLE'
        AND (SELECT COUNT(*) FROM "CallAttempt" c WHERE c."respondentId" = r.id) >= ${config.file.maxTentatives}
    `;

    // 4. Atomically claim the next available respondent.
    const lignes = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Respondent"
      WHERE "status" = 'DISPONIBLE'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (!lignes[0]) return null;

    const nbTentatives = await tx.callAttempt.count({ where: { respondentId: lignes[0].id } });
    const verrou = nouvelleEcheanceVerrou(maintenant);

    const repondant = await tx.respondent.update({
      where: { id: lignes[0].id },
      data: {
        status: "EN_COURS",
        assignedToId: agentId,
        assignedAt: maintenant,
        lockExpiresAt: verrou,
      },
    });

    const appel = await tx.callAttempt.create({
      data: {
        respondentId: repondant.id,
        agentId,
        status: "EN_COURS",
        attemptNumber: nbTentatives + 1,
        startedAt: maintenant,
      },
    });

    return { reprise: false, etape: "APPEL" as const, appel, repondant };
  });
}

/** Explicit release (agent cancels before dialing). */
export async function libererRepondant(respondentId: string, agentId: string): Promise<void> {
  const repondant = await db.respondent.findUnique({ where: { id: respondentId } });
  if (!repondant) return;
  if (repondant.assignedToId && repondant.assignedToId !== agentId) {
    throw new AppError("ACCES_REFUSE", "Ce répondant est attribué à un autre agent.");
  }
  await db.respondent.update({
    where: { id: respondentId },
    data: { status: "DISPONIBLE", assignedToId: null, assignedAt: null, lockExpiresAt: null },
  });
}
