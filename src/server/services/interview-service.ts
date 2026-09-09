import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import { enregistrerAudit } from "@/lib/audit";
import { marquerEtatActivite } from "@/server/services/agent-session-service";
import {
  normaliserValeur,
  questionsVisibles,
  signatureReponses,
  validerQuestionnaire,
  versColonnes,
  type QuestionDef,
  type ReponsesParCle,
  type ValeurReponse,
} from "@/lib/survey-engine";
import {
  signalerDureeTropCourte,
  signalerDoublon,
  signalerIncoherence,
  signalerRepetitionReponses,
  signalerActiviteExcessive,
  type PropositionSignalement,
  type SeuilsQualite,
} from "@/lib/quality/rules";
import type { Prisma } from "@prisma/client";

/**
 * INTERVIEW LIFECYCLE.
 * Submission is FULLY TRANSACTIONAL: answers + interview state + respondent
 * state + agent presence + quality flags commit together or not at all —
 * an interview can never end up half-created with orphaned answers.
 */

type Tx = Prisma.TransactionClient;

function seuilsQualite(): SeuilsQualite {
  return {
    dureeMinimaleSecondes: config.qualite.dureeMinimaleSecondes,
    secondesParQuestion: config.qualite.secondesParQuestion,
    seuilRepetition: config.qualite.seuilRepetition,
    zScoreActivite: config.qualite.zScoreActivite,
    volumeMinimalActivite: config.qualite.volumeMinimalActivite,
  };
}

/** Loads a published survey version with its full question graph. */
export async function chargerVersionPubliee(surveyVersionId: string) {
  const version = await db.surveyVersion.findUnique({
    where: { id: surveyVersionId },
    include: {
      survey: { select: { id: true, title: true, description: true } },
      questions: { include: { options: true }, orderBy: { order: "asc" } },
    },
  });
  if (!version) throw new AppError("INTROUVABLE", "Cette version d'enquête est introuvable.");
  if (version.status !== "PUBLIEE") {
    throw new AppError("ETAT_INVALIDE", "Seules les versions publiées peuvent être interrogées.");
  }
  return version;
}

/** Starts (or resumes) an interview for a completed call. */
export async function demarrerEntretien(params: { agentId: string; callAttemptId: string }) {
  return db.$transaction(async (tx) => {
    const appel = await tx.callAttempt.findUnique({
      where: { id: params.callAttemptId },
      include: { respondent: true },
    });
    if (!appel) throw new AppError("INTROUVABLE", "Cet appel est introuvable.");
    if (appel.agentId !== params.agentId) throw new AppError("ACCES_REFUSE");
    if (appel.status !== "TERMINE") {
      throw new AppError("ETAT_INVALIDE", "L'appel doit être terminé avant de démarrer l'entretien.");
    }

    // Resume an already-started interview for this call (refresh-safe).
    const existant = await tx.interview.findUnique({ where: { callAttemptId: appel.id } });
    if (existant) {
      if (existant.status !== "EN_COURS") {
        throw new AppError("ETAT_INVALIDE", "Un entretien est déjà finalisé pour cet appel.");
      }
      await marquerEtatActivite(params.agentId, "EN_ENTRETIEN");
      return existant;
    }

    // Which survey version? The active published version of the center's
    // running survey — pick the most recently published version.
    const version = await tx.surveyVersion.findFirst({
      where: { status: "PUBLIEE" },
      orderBy: { publishedAt: "desc" },
    });
    if (!version) {
      throw new AppError("ETAT_INVALIDE", "Aucune enquête publiée n'est actuellement disponible.");
    }

    const entretien = await tx.interview.create({
      data: {
        respondentId: appel.respondentId,
        surveyVersionId: version.id,
        agentId: params.agentId,
        callAttemptId: appel.id,
        status: "EN_COURS",
        startedAt: new Date(),
      },
    });

    await marquerEtatActivite(params.agentId, "EN_ENTRETIEN");
    return entretien;
  });
}

async function contexteEntretien(tx: Tx, interviewId: string, agentId: string) {
  const entretien = await tx.interview.findUnique({
    where: { id: interviewId },
    include: {
      respondent: true,
      callAttempt: true,
    },
  });
  if (!entretien) throw new AppError("INTROUVABLE", "Cet entretien est introuvable.");
  if (entretien.agentId !== agentId) {
    throw new AppError("ACCES_REFUSE", "Cet entretien n'est pas assigné à votre session.");
  }
  return entretien;
}

/** Autosave: persists one answer (upsert) with full server-side validation. */
export async function enregistrerReponse(params: {
  agentId: string;
  interviewId: string;
  questionKey: string;
  valeurBrute: unknown;
}): Promise<{ ok: true }> {
  return db.$transaction(async (tx) => {
    const entretien = await contexteEntretien(tx, params.interviewId, params.agentId);
    if (entretien.status !== "EN_COURS") {
      throw new AppError("ETAT_INVALIDE", "Cet entretien n'est plus en cours.");
    }

    const version = await tx.surveyVersion.findUnique({
      where: { id: entretien.surveyVersionId },
      include: { questions: { include: { options: true } } },
    });
    if (!version) throw new AppError("INTROUVABLE", "La version d'enquête associée est introuvable.");

    const question = version.questions.find((q) => q.key === params.questionKey);
    if (!question) throw new AppError("VALIDATION", "Question inconnue pour ce questionnaire.");

    // Rebuild the current answers map to evaluate visibility.
    const reponses = await chargerReponses(tx, params.interviewId);
    const valeur = normaliserValeur(question as unknown as QuestionDef, params.valeurBrute);
    reponses[question.key] = valeur;

    const { estVisible } = await import("@/lib/survey-engine");
    const visible = estVisible(question as unknown as QuestionDef, reponses);
    if (!visible) {
      throw new AppError("ETAT_INVALIDE", "Cette question n'est pas applicable actuellement.");
    }

    const colonnes = versColonnes(valeur);
    const vide = Object.keys(colonnes).length === 0;

    const existante = await tx.answer.findUnique({
      where: { interviewId_questionId: { interviewId: params.interviewId, questionId: question.id } },
    });

    if (vide) {
      if (existante) await tx.answer.delete({ where: { id: existante.id } });
      return { ok: true as const };
    }

    await tx.answer.upsert({
      where: { interviewId_questionId: { interviewId: params.interviewId, questionId: question.id } },
      create: {
        interviewId: params.interviewId,
        questionId: question.id,
        questionKey: question.key,
        ...colonnes,
      },
      update: { ...colonnes },
    });

    return { ok: true as const };
  });
}

async function chargerReponses(tx: Tx, interviewId: string): Promise<ReponsesParCle> {
  const lignes = await tx.answer.findMany({ where: { interviewId } });
  const { depuisColonnes } = await import("@/lib/survey-engine");
  const reponses: ReponsesParCle = {};
  for (const ligne of lignes) {
    reponses[ligne.questionKey] = depuisColonnes(ligne);
  }
  return reponses;
}

export interface ResultatSoumission {
  interviewId: string;
  dureeSecondes: number;
  signalements: number;
}

/** Final, transactional interview submission. */
export async function soumettreEntretien(params: {
  agentId: string;
  interviewId: string;
  reponsesBrutes: Record<string, unknown>;
}): Promise<ResultatSoumission> {
  const maintenant = new Date();

  return db.$transaction(async (tx) => {
    const entretien = await contexteEntretien(tx, params.interviewId, params.agentId);
    if (entretien.status !== "EN_COURS") {
      throw new AppError("ETAT_INVALIDE", "Cet entretien a déjà été traité.");
    }

    const version = await tx.surveyVersion.findUnique({
      where: { id: entretien.surveyVersionId },
      include: { questions: { include: { options: true }, orderBy: { order: "asc" } } },
    });
    if (!version) throw new AppError("INTROUVABLE", "La version d'enquête associée est introuvable.");

    // Normalize every supplied answer against the question definitions.
    const reponses: ReponsesParCle = {};
    for (const [cle, brute] of Object.entries(params.reponsesBrutes ?? {})) {
      const question = version.questions.find((q) => q.key === cle);
      if (!question) continue; // unknown keys are ignored (never stored)
      reponses[cle] = normaliserValeur(question as unknown as QuestionDef, brute);
    }

    const questions = version.questions as unknown as QuestionDef[];
    const visibles = questionsVisibles(questions, reponses);

    // Full server-side validation of the visible questionnaire.
    const erreurs = validerQuestionnaire(questions, reponses, visibles);
    if (Object.keys(erreurs).length > 0) {
      throw new AppError("VALIDATION", "Certaines réponses sont invalides ou incomplètes.", { erreurs });
    }

    // Persist answers: upsert visible ones, delete stale non-visible ones.
    for (const question of visibles) {
      const valeur: ValeurReponse = reponses[question.key] ?? {};
      const colonnes = versColonnes(valeur);
      if (Object.keys(colonnes).length === 0) continue;
      await tx.answer.upsert({
        where: { interviewId_questionId: { interviewId: entretien.id, questionId: question.id } },
        create: {
          interviewId: entretien.id,
          questionId: question.id,
          questionKey: question.key,
          ...colonnes,
        },
        update: { ...colonnes },
      });
    }
    for (const question of questions) {
      if (visibles.some((v) => v.id === question.id)) continue;
      await tx.answer.deleteMany({
        where: { interviewId: entretien.id, questionId: question.id },
      });
    }

    const duree = Math.max(0, Math.floor((maintenant.getTime() - entretien.startedAt.getTime()) / 1000));

    await tx.interview.update({
      where: { id: entretien.id },
      data: { status: "TERMINE", completedAt: maintenant, durationSeconds: duree },
    });

    await tx.respondent.update({
      where: { id: entretien.respondentId },
      data: { status: "INTERROGE", assignedToId: null, assignedAt: null, lockExpiresAt: null },
    });

    await marquerEtatActivite(params.agentId, "DISPONIBLE");

    // ---------------- Quality engine (same transaction) ----------------
    const propositions: (PropositionSignalement | null)[] = [];

    propositions.push(
      signalerDureeTropCourte({
        dureeSecondes: duree,
        nbQuestionsVisibles: visibles.length,
        seuils: seuilsQualite(),
      }),
    );

    const doublons = await tx.interview.findMany({
      where: {
        respondentId: entretien.respondentId,
        surveyVersionId: entretien.surveyVersionId,
        status: "TERMINE",
      },
      select: { id: true, completedAt: true },
    });
    propositions.push(signalerDoublon({ interviewsTerminesMemeRepondant: doublons, interviewCouranteId: entretien.id }));

    const signature = signatureReponses(reponses);
    const recents = await tx.interview.findMany({
      where: { agentId: params.agentId, status: "TERMINE" },
      select: { id: true },
      orderBy: { completedAt: "desc" },
      take: 40,
    });
    if (recents.length > 0) {
      const reponsesRecents = await tx.answer.findMany({
        where: { interviewId: { in: recents.map((r) => r.id) } },
        select: { interviewId: true, questionKey: true, choiceValues: true, boolValue: true, numberValue: true },
      });
      const parEntretien: Record<string, ReponsesParCle> = {};
      for (const r of reponsesRecents) {
        (parEntretien[r.interviewId] ??= {})[r.questionKey] = {
          choix: r.choiceValues ?? undefined,
          booleen: r.boolValue ?? undefined,
          nombre: r.numberValue ?? undefined,
        };
      }
      const historique = recents.map((r) => ({ interviewId: r.id, signature: signatureReponses(parEntretien[r.id] ?? {}) }));
      propositions.push(
        signalerRepetitionReponses({
          signaturesHistoriquesAgent: historique,
          interviewCourantId: entretien.id,
          signatureCourante: signature,
          seuils: seuilsQualite(),
        }),
      );
    }

    // Volumétrie de l'équipe aujourd'hui (base de référence pour ACTIVITE_EXCESSIVE).
    const debutJour = new Date();
    debutJour.setHours(0, 0, 0, 0);
    const volumesEquipe = await tx.interview.groupBy({
      by: ["agentId"],
      where: { status: "TERMINE", completedAt: { gte: debutJour } },
      _count: true,
    });
    propositions.push(
      signalerActiviteExcessive({
        agentId: params.agentId,
        entretiensAgentAujourdHui: volumesEquipe.find((v) => v.agentId === params.agentId)?._count ?? 0,
        entretiensEquipeAujourdHui: volumesEquipe.map((v) => ({ agentId: v.agentId, total: v._count })),
        seuils: seuilsQualite(),
      }),
    );

    propositions.push(
      signalerIncoherence({
        reponses,
        configuration: version.config as Parameters<typeof signalerIncoherence>[0]["configuration"],
      }),
    );

    const signalementsValides = propositions.filter((p): p is NonNullable<typeof p> => p !== null);

    if (signalementsValides.length > 0) {
      await tx.qualityFlag.createMany({
        data: signalementsValides.map((p) => ({
          interviewId: entretien.id,
          agentId: params.agentId,
          type: p.type,
          severity: p.severite,
          reason: p.raison,
          metadata: (p.metadata ?? {}) as Prisma.InputJsonValue,
          status: "A_EXAMINER" as const,
        })),
      });
      await tx.interview.update({
        where: { id: entretien.id },
        data: { qualityStatus: "A_EXAMINER" },
      });
    }

    return { interviewId: entretien.id, dureeSecondes: duree, signalements: signalementsValides.length };
  });
}

/** Agent abandons an in-progress interview (respondent hangs up mid-survey…). */
export async function abandonnerEntretien(params: { agentId: string; interviewId: string }) {
  await db.$transaction(async (tx) => {
    const entretien = await contexteEntretien(tx, params.interviewId, params.agentId);
    if (entretien.status !== "EN_COURS") {
      throw new AppError("ETAT_INVALIDE", "Cet entretien n'est plus en cours.");
    }
    await tx.interview.update({
      where: { id: entretien.id },
      data: { status: "ABANDONNE" },
    });
    await tx.respondent.update({
      where: { id: entretien.respondentId },
      data: { status: "DISPONIBLE", assignedToId: null, assignedAt: null, lockExpiresAt: null },
    });
    await marquerEtatActivite(params.agentId, "DISPONIBLE");
  });
  await enregistrerAudit({
    userId: params.agentId,
    action: "ENTRETIEN_ABANDONNE",
    entityType: "Interview",
    entityId: params.interviewId,
  });
}
