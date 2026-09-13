import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";
import type { Prisma, TypeQuestion } from "@prisma/client";

/**
 * SURVEY & VERSIONING SERVICE.
 * Immutable-version workflow:
 *   BROUILLON → (edit, preview) → PUBLIEE (immutable forever) → ARCHIVEE
 * Mutations are only ever allowed on BROUILLON versions; the DB triggers in
 * prisma/guards.sql back this up at the storage layer.
 */

const TYPES_AVEC_OPTIONS: TypeQuestion[] = ["CHOIX_UNIQUE", "CHOIX_MULTIPLE", "LISTE_DEROULANTE"];

export async function listerEnquetes() {
  return db.survey.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      versions: { orderBy: { versionNumber: "desc" } },
      _count: { select: { versions: true } },
    },
  });
}

export async function obtenirEnquete(id: string) {
  const enquete = await db.survey.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { _count: { select: { questions: true, interviews: true } } },
      },
    },
  });
  if (!enquete) throw new AppError("INTROUVABLE", "Cette enquête est introuvable.");
  return enquete;
}

export async function obtenirVersion(idVersion: string) {
  const version = await db.surveyVersion.findUnique({
    where: { id: idVersion },
    include: {
      survey: { select: { id: true, title: true, description: true, status: true } },
      questions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
      _count: { select: { interviews: true } },
    },
  });
  if (!version) throw new AppError("INTROUVABLE", "Cette version est introuvable.");
  return version;
}

export async function creerEnquete(params: {
  utilisateurId: string;
  titre: string;
  description?: string;
}) {
  const enquete = await db.$transaction(async (tx) => {
    const enquete = await tx.survey.create({
      data: {
        title: params.titre,
        description: params.description || null,
        status: "BROUILLON",
        createdById: params.utilisateurId,
        versions: { create: { versionNumber: 1, status: "BROUILLON" } },
      },
      include: { versions: true },
    });
    return enquete;
  });
  await enregistrerAudit({
    userId: params.utilisateurId,
    action: ACTIONS_AUDIT.ENQUETE_CREEE,
    entityType: "Survey",
    entityId: enquete.id,
    metadata: { titre: params.titre },
  });
  return enquete;
}

/**
 * Creates a NEW draft version cloned from the latest version (questions +
 * options + config). Refuses if a draft already exists (one draft at a time).
 */
export async function creerNouvelleVersion(params: { utilisateurId: string; surveyId: string }) {
  const enquete = await db.survey.findUnique({
    where: { id: params.surveyId },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!enquete) throw new AppError("INTROUVABLE", "Enquête introuvable.");

  const brouillonExistant = enquete.versions.find((v) => v.status === "BROUILLON");
  if (brouillonExistant) {
    throw new AppError("ETAT_INVALIDE", "Un brouillon existe déjà pour cette enquête.");
  }
  const derniere = enquete.versions[0];
  if (!derniere) throw new AppError("ETAT_INVALIDE", "Aucune version source disponible.");

  const version = await db.$transaction(async (tx) => {
    const nouvelle = await tx.surveyVersion.create({
      data: {
        surveyId: enquete.id,
        versionNumber: derniere.versionNumber + 1,
        status: "BROUILLON",
        config: (derniere.config ?? undefined) as Prisma.InputJsonValue | undefined,
        changelog: `Nouvelle version à partir de la v${derniere.versionNumber}`,
      },
    });

    const questions = await tx.question.findMany({
      where: { surveyVersionId: derniere.id },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    });

    for (const q of questions) {
      const { id: _id, surveyVersionId: _sv, createdAt: _c, updatedAt: _u, options: opts, ...reste } = q;
      const nouvelleQuestion = await tx.question.create({
        data: {
          ...reste,
          surveyVersionId: nouvelle.id,
          configuration: q.configuration === null ? undefined : (q.configuration as Prisma.InputJsonValue),
          validationRules: q.validationRules === null ? undefined : (q.validationRules as Prisma.InputJsonValue),
          conditionalLogic: q.conditionalLogic === null ? undefined : (q.conditionalLogic as Prisma.InputJsonValue),
        },
      });
      for (const o of opts) {
        const { id: _oid, questionId: _qid, ...resteOption } = o;
        await tx.questionOption.create({
          data: { ...resteOption, questionId: nouvelleQuestion.id },
        });
      }
    }
    return nouvelle;
  });

  await enregistrerAudit({
    userId: params.utilisateurId,
    action: ACTIONS_AUDIT.VERSION_CREEE,
    entityType: "SurveyVersion",
    entityId: version.id,
    metadata: { surveyId: enquete.id, versionNumber: version.versionNumber },
  });
  return version;
}

export async function publierVersion(params: { utilisateurId: string; versionId: string }) {
  const version = await db.surveyVersion.findUnique({
    where: { id: params.versionId },
    include: { questions: { include: { options: true } } },
  });
  if (!version) throw new AppError("INTROUVABLE", "Version introuvable.");
  if (version.status !== "BROUILLON") {
    throw new AppError("ETAT_INVALIDE", "Seul un brouillon peut être publié.");
  }
  if (version.questions.length === 0) {
    throw new AppError("VALIDATION", "Impossible de publier une version sans question.");
  }

  // Structural integrity checks before freezing.
  for (const q of version.questions) {
    if (TYPES_AVEC_OPTIONS.includes(q.type) && q.options.length === 0) {
      throw new AppError(
        "VALIDATION",
        `La question « ${q.text.slice(0, 60)} » doit comporter au moins une option.`,
      );
    }
  }

  const result = await db.$transaction(async (tx) => {
    const publiee = await tx.surveyVersion.update({
      where: { id: version.id },
      data: { status: "PUBLIEE", publishedAt: new Date() },
    });
    await tx.survey.update({ where: { id: version.surveyId }, data: { status: "PUBLIEE" } });
    return publiee;
  });

  await enregistrerAudit({
    userId: params.utilisateurId,
    action: ACTIONS_AUDIT.ENQUETE_PUBLIEE,
    entityType: "SurveyVersion",
    entityId: version.id,
    metadata: { surveyId: version.surveyId, versionNumber: version.versionNumber, nbQuestions: version.questions.length },
  });
  return result;
}

export async function archiverVersion(params: { utilisateurId: string; versionId: string }) {
  const version = await db.surveyVersion.findUnique({ where: { id: params.versionId } });
  if (!version) throw new AppError("INTROUVABLE", "Version introuvable.");
  if (version.status !== "PUBLIEE") throw new AppError("ETAT_INVALIDE", "Seule une version publiée peut être archivée.");

  const result = await db.surveyVersion.update({
    where: { id: version.id },
    data: { status: "ARCHIVEE", archivedAt: new Date() },
  });
  await enregistrerAudit({
    userId: params.utilisateurId,
    action: ACTIONS_AUDIT.ENQUETE_ARCHIVEE,
    entityType: "SurveyVersion",
    entityId: version.id,
  });
  return result;
}

export async function majEnquete(params: {
  utilisateurId: string;
  surveyId: string;
  titre?: string;
  description?: string;
}) {
  const data: Prisma.SurveyUpdateInput = {};
  if (params.titre !== undefined) data.title = params.titre;
  if (params.description !== undefined) data.description = params.description || null;
  const enquete = await db.survey.update({ where: { id: params.surveyId }, data });
  await enregistrerAudit({
    userId: params.utilisateurId,
    action: ACTIONS_AUDIT.ENQUETE_MODIFIEE,
    entityType: "Survey",
    entityId: enquete.id,
  });
  return enquete;
}

// ---------------------------------------------------------------------------
// Question mutations — BROUILLON versions only
// ---------------------------------------------------------------------------

async function exigerVersionBrouillon(tx: Prisma.TransactionClient | typeof db, versionId: string) {
  const version = await tx.surveyVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new AppError("INTROUVABLE", "Version introuvable.");
  if (version.status !== "BROUILLON") {
    throw new AppError("ETAT_INVALIDE", "Cette version est publiée : créez une nouvelle version pour la modifier.");
  }
  return version;
}

export interface DonneesQuestion {
  key: string;
  text: string;
  helpText?: string;
  type: TypeQuestion;
  required: boolean;
  configuration?: unknown;
  validationRules?: unknown;
  conditionalLogic?: unknown;
  options: { label: string; value: string; order: number }[];
}

export async function creerQuestion(params: {
  utilisateurId: string;
  versionId: string;
  donnees: DonneesQuestion;
}) {
  await exigerVersionBrouillon(db, params.versionId);
  const ordreMax = await db.question.aggregate({
    where: { surveyVersionId: params.versionId },
    _max: { order: true },
  });
  const question = await db.question.create({
    data: {
      surveyVersionId: params.versionId,
      key: params.donnees.key,
      text: params.donnees.text,
      helpText: params.donnees.helpText || null,
      type: params.donnees.type,
      required: params.donnees.required,
      order: (ordreMax._max.order ?? -1) + 1,
      configuration: (params.donnees.configuration ?? undefined) as Prisma.InputJsonValue,
      validationRules: (params.donnees.validationRules ?? undefined) as Prisma.InputJsonValue,
      conditionalLogic: (params.donnees.conditionalLogic ?? undefined) as Prisma.InputJsonValue,
      options: {
        create: TYPES_AVEC_OPTIONS.includes(params.donnees.type)
          ? params.donnees.options.map((o, i) => ({ label: o.label, value: o.value, order: o.order ?? i }))
          : [],
      },
    },
    include: { options: { orderBy: { order: "asc" } } },
  });
  return question;
}

export async function majQuestion(params: {
  utilisateurId: string;
  questionId: string;
  donnees: DonneesQuestion;
}) {
  const existante = await db.question.findUnique({ where: { id: params.questionId } });
  if (!existante) throw new AppError("INTROUVABLE", "Question introuvable.");
  await exigerVersionBrouillon(db, existante.surveyVersionId);

  const question = await db.$transaction(async (tx) => {
    const { options, ...reste } = params.donnees;
    const q = await tx.question.update({
      where: { id: existante.id },
      data: {
        key: reste.key,
        text: reste.text,
        helpText: reste.helpText || null,
        type: reste.type,
        required: reste.required,
        configuration: (reste.configuration ?? undefined) as Prisma.InputJsonValue,
        validationRules: (reste.validationRules ?? undefined) as Prisma.InputJsonValue,
        conditionalLogic: (reste.conditionalLogic ?? undefined) as Prisma.InputJsonValue,
      },
    });
    await tx.questionOption.deleteMany({ where: { questionId: existante.id } });
    if (TYPES_AVEC_OPTIONS.includes(reste.type) && options.length > 0) {
      await tx.questionOption.createMany({
        data: options.map((o, i) => ({ questionId: existante.id, label: o.label, value: o.value, order: o.order ?? i })),
      });
    }
    return q;
  });
  return question;
}

export async function supprimerQuestion(params: { utilisateurId: string; questionId: string }) {
  const existante = await db.question.findUnique({ where: { id: params.questionId } });
  if (!existante) throw new AppError("INTROUVABLE", "Question introuvable.");
  await exigerVersionBrouillon(db, existante.surveyVersionId);
  await db.question.delete({ where: { id: existante.id } });
}

export async function dupliquerQuestion(params: { utilisateurId: string; questionId: string }) {
  const source = await db.question.findUnique({
    where: { id: params.questionId },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!source) throw new AppError("INTROUVABLE", "Question introuvable.");
  await exigerVersionBrouillon(db, source.surveyVersionId);

  const ordreMax = await db.question.aggregate({
    where: { surveyVersionId: source.surveyVersionId },
    _max: { order: true },
  });

  return db.$transaction(async (tx) => {
    let nouvelleCle = `${source.key}_copie`;
    let essai = 2;
    while (await tx.question.findFirst({ where: { surveyVersionId: source.surveyVersionId, key: nouvelleCle } })) {
      nouvelleCle = `${source.key}_copie${essai++}`;
    }
    const copie = await tx.question.create({
      data: {
        surveyVersionId: source.surveyVersionId,
        key: nouvelleCle,
        text: source.text,
        helpText: source.helpText,
        type: source.type,
        required: source.required,
        order: (ordreMax._max.order ?? -1) + 1,
        configuration: source.configuration as Prisma.InputJsonValue,
        validationRules: source.validationRules as Prisma.InputJsonValue,
        conditionalLogic: source.conditionalLogic as Prisma.InputJsonValue,
        options: {
          create: source.options.map((o) => ({ label: o.label, value: o.value, order: o.order })),
        },
      },
      include: { options: { orderBy: { order: "asc" } } },
    });
    return copie;
  });
}

/** Reorders questions (drag & drop). Idempotent, transactional. */
export async function reordonnerQuestions(params: {
  utilisateurId: string;
  versionId: string;
  ordre: string[]; // question ids in their new order
}) {
  await exigerVersionBrouillon(db, params.versionId);
  await db.$transaction(async (tx) => {
    for (let i = 0; i < params.ordre.length; i++) {
      await tx.question.updateMany({
        where: { id: params.ordre[i], surveyVersionId: params.versionId },
        data: { order: i },
      });
    }
  });
}

export async function majConfigVersion(params: {
  utilisateurId: string;
  versionId: string;
  config: unknown;
}) {
  await exigerVersionBrouillon(db, params.versionId);
  return db.surveyVersion.update({
    where: { id: params.versionId },
    data: { config: params.config as Prisma.InputJsonValue },
  });
}

// ------------------- UNITED Research — script d'introduction -------------------

/**
 * Met à jour le script d'introduction d'une campagne.
 * Le script est stocké sur la campagne (pas sur la version) car il change
 * rarement et doit rester identique across versions. L'historique des
 * versions immuables protège les questions/réponses, pas le script.
 *
 * Cette mise à jour est DONC autorisée même si la campagne est publiée.
 * L'action est journalisée pour traçabilité.
 */
export async function majScriptEnquete(params: {
  utilisateurId: string;
  surveyId: string;
  openingScript: string;
  candidateName?: string;
  campaignInstructions?: string;
  complianceMessage?: string;
  contactInfo?: string;
}) {
  const enquete = await db.survey.findUnique({ where: { id: params.surveyId } });
  if (!enquete) throw new AppError("INTROUVABLE", "Campagne introuvable.");

  await db.survey.update({
    where: { id: params.surveyId },
    data: {
      openingScript: params.openingScript,
      candidateName: params.candidateName || null,
      campaignInstructions: params.campaignInstructions || null,
      complianceMessage: params.complianceMessage || null,
      contactInfo: params.contactInfo || null,
      updatedById: params.utilisateurId,
    },
  });

  await enregistrerAudit({
    userId: params.utilisateurId,
    action: ACTIONS_AUDIT.SCRIPT_MODIFIE,
    entityType: "Survey",
    entityId: params.surveyId,
    metadata: {
      longueurScript: params.openingScript.length,
      candidat: params.candidateName || null,
    },
  });
}

/**
 * Retourne la campagne active (publiée) avec son script et ses champs.
 * Utilisé par l'espace agent pour afficher le script d'introduction.
 */
export async function obtenirCampagneActive() {
  const enquete = await db.survey.findFirst({
    where: { status: "PUBLIEE" },
    include: {
      versions: {
        where: { status: "PUBLIEE" },
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          questions: {
            orderBy: { order: "asc" },
            select: { id: true, key: true, text: true, type: true, required: true, order: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return enquete;
}
