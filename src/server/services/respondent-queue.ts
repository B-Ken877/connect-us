import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import { marquerEtatActivite } from "@/server/services/agent-session-service";
import type { CallAttempt, Interview, Prisma, Respondent } from "@prisma/client";

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
 *  - An agent always resumes their own in-progress interview (page refresh /
 *    reconnect / app-switch safe).
 *  - The partial unique index uq_appel_actif_par_agent (CallAttempt.agentId
 *    WHERE status='EN_COURS') makes double-submission of "next respondent"
 *    impossible at the database level.
 *
 * CATI WORKFLOW (refactor): the assignment is interview-first. When an agent
 * requests the next respondent, the queue atomically reserves the respondent,
 * creates the CallAttempt AND the Interview bound to the exact published
 * SurveyVersion active at that instant. The agent lands directly in the
 * interview workspace with the questionnaire already on screen — the call
 * controls live inside that workspace. The interview's surveyVersionId is
 * frozen forever: publishing a newer version later never mutates interviews
 * already in progress.
 */

export interface AttributionRepondant {
  reprise: boolean;
  appel: CallAttempt;
  entretien: Interview;
  repondant: Respondent;
}

type Tx = Prisma.TransactionClient;

function nouvelleEcheanceVerrou(depuis: Date = new Date()): Date {
  return new Date(depuis.getTime() + config.file.verrouMinutes * 60_000);
}

function violationContrainteUnique(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: string }).code === "P2002"
  );
}

/** The published survey version active at assignment time (frozen afterwards). */
function versionPublieeActive(tx: Tx) {
  return tx.surveyVersion.findFirst({
    where: { status: "PUBLIEE" },
    orderBy: { publishedAt: "desc" },
  });
}

async function rafraichirVerrou(tx: Tx, respondentId: string, agentId: string, maintenant: Date) {
  await tx.respondent.update({
    where: { id: respondentId },
    data: {
      status: "EN_COURS",
      assignedToId: agentId,
      assignedAt: maintenant,
      lockExpiresAt: nouvelleEcheanceVerrou(maintenant),
    },
  });
}

async function creerAppelEtEntretien(
  tx: Tx,
  agentId: string,
  repondantId: string,
  maintenant: Date,
): Promise<{ appel: CallAttempt; entretien: Interview }> {
  const version = await versionPublieeActive(tx);
  if (!version) {
    throw new AppError("ETAT_INVALIDE", "Aucune enquête publiée n'est actuellement disponible.");
  }
  const nbTentatives = await tx.callAttempt.count({ where: { respondentId: repondantId } });
  const appel = await tx.callAttempt.create({
    data: {
      respondentId: repondantId,
      agentId,
      status: "EN_COURS",
      attemptNumber: nbTentatives + 1,
      startedAt: maintenant,
    },
  });
  // The interview is born WITH the call attempt and pinned to the exact
  // published version — never re-resolved later.
  const entretien = await tx.interview.create({
    data: {
      respondentId: repondantId,
      surveyVersionId: version.id,
      agentId,
      callAttemptId: appel.id,
      status: "EN_COURS",
      startedAt: maintenant,
    },
  });
  return { appel, entretien };
}

/**
 * Requests the next respondent for an agent:
 *  1. resume the agent's own in-progress interview (if any), or upgrade a
 *     legacy in-progress call without interview by creating the interview now;
 *  2. otherwise atomically claim a new respondent and create the
 *     CallAttempt + Interview pair in the same transaction.
 * Returns null when the queue is empty.
 */
export async function attribuerProchainRepondant(agentId: string): Promise<AttributionRepondant | null> {
  try {
    return await db.$transaction(async (tx) => {
      const maintenant = new Date();

      // 1. Release stale locks (agent vanished mid-call / mid-interview).
      await tx.respondent.updateMany({
        where: { status: "EN_COURS", lockExpiresAt: { lt: maintenant } },
        data: { status: "DISPONIBLE", assignedToId: null, assignedAt: null, lockExpiresAt: null },
      });

      // 2. Resume the agent's own in-progress interview.
      const entretienEnCours = await tx.interview.findFirst({
        where: { agentId, status: "EN_COURS" },
        include: { respondent: true, callAttempt: true },
        orderBy: { startedAt: "desc" },
      });
      if (entretienEnCours) {
        await rafraichirVerrou(tx, entretienEnCours.respondentId, agentId, maintenant);
        await marquerEtatActivite(agentId, "EN_ENTRETIEN");
        return {
          reprise: true,
          appel: entretienEnCours.callAttempt as CallAttempt,
          entretien: entretienEnCours,
          repondant: entretienEnCours.respondent,
        };
      }

      // 3. Legacy compatibility: an in-progress call left open without a live
      //    interview (data from before the interview-first refactor). The
      //    interview is created now so the agent lands in the workspace.
      const appelOrphelin = await tx.callAttempt.findFirst({
        where: { agentId, status: "EN_COURS" },
        include: { respondent: true },
      });
      if (appelOrphelin) {
        const existant = await tx.interview.findUnique({ where: { callAttemptId: appelOrphelin.id } });
        if (existant && existant.status === "EN_COURS") {
          await rafraichirVerrou(tx, appelOrphelin.respondentId, agentId, maintenant);
          await marquerEtatActivite(agentId, "EN_ENTRETIEN");
          return { reprise: true, appel: appelOrphelin, entretien: existant, repondant: appelOrphelin.respondent };
        }
        if (!existant) {
          const version = await versionPublieeActive(tx);
          if (!version) {
            throw new AppError("ETAT_INVALIDE", "Aucune enquête publiée n'est actuellement disponible.");
          }
          const entretien = await tx.interview.create({
            data: {
              respondentId: appelOrphelin.respondentId,
              surveyVersionId: version.id,
              agentId,
              callAttemptId: appelOrphelin.id,
              status: "EN_COURS",
              startedAt: maintenant,
            },
          });
          await rafraichirVerrou(tx, appelOrphelin.respondentId, agentId, maintenant);
          await marquerEtatActivite(agentId, "EN_ENTRETIEN");
          return { reprise: true, appel: appelOrphelin, entretien, repondant: appelOrphelin.respondent };
        }
        // Interview already closed but call left open (legacy anomaly):
        // close the call and move on to a fresh respondent.
        await tx.callAttempt.update({
          where: { id: appelOrphelin.id },
          data: { status: "ABANDONNE", endedAt: maintenant },
        });
      }

      // 4. Park respondents that exhausted their attempts.
      await tx.$executeRaw`
        UPDATE "Respondent" r
        SET "status" = 'INJOIGNABLE', "updatedAt" = ${maintenant}
        WHERE r."status" = 'DISPONIBLE'
          AND (SELECT COUNT(*) FROM "CallAttempt" c WHERE c."respondentId" = r.id) >= ${config.file.maxTentatives}
      `;

      // 5. Atomically claim the next available respondent.
      const lignes = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Respondent"
        WHERE "status" = 'DISPONIBLE'
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!lignes[0]) return null;

      const repondant = await tx.respondent.update({
        where: { id: lignes[0].id },
        data: {
          status: "EN_COURS",
          assignedToId: agentId,
          assignedAt: maintenant,
          lockExpiresAt: nouvelleEcheanceVerrou(maintenant),
        },
      });

      const { appel, entretien } = await creerAppelEtEntretien(tx, agentId, repondant.id, maintenant);
      await marquerEtatActivite(agentId, "EN_ENTRETIEN");
      return { reprise: false, appel, entretien, repondant };
    });
  } catch (cause) {
    // Double-click / racing requests: the partial unique index on active calls
    // rejects the second CallAttempt → translate into an actionable message.
    if (violationContrainteUnique(cause)) {
      throw new AppError(
        "CONFLIT",
        "Vous avez déjà un appel en cours sur votre session. Réessayez : votre entretien en cours vous sera proposé.",
      );
    }
    throw cause;
  }
}

/** Explicit release (agent cancels before dialing — legacy screen only). */
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
