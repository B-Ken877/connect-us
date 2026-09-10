/**
 * INTEGRATION TESTS — agent calling workflow (interview-first CATI refactor).
 *
 * Runs against a REAL PostgreSQL (embedded, isolated test database on port
 * 5434 booted by tests/global-setup.ts). Covers the acceptance matrix:
 *   1. Workflow        — assign → CallAttempt + Interview created (exact
 *                        published SurveyVersion) → autosave → submit →
 *                        dispositions → next respondent.
 *   2. Concurrency     — two agents never receive the same respondent;
 *                        same-agent double requests never duplicate work.
 *   3. Authorization   — agent B cannot touch agent A's interview.
 *   4. Resume          — leaving and coming back restores the same interview
 *                        with saved answers intact.
 *   5. Version pinning — a newly published version never mutates interviews
 *                        already in progress.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { attribuerProchainRepondant } from "@/server/services/respondent-queue";
import {
  enregistrerReponse,
  soumettreEntretien,
  cloturerAppelSansEntretien,
  abandonnerEntretien,
} from "@/server/services/interview-service";

afterAll(async () => {
  // Release the Prisma connection pool so vitest's close phase is clean.
  await db.$disconnect();
});

let compteur = 0;
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${compteur++}`;

async function creerAgent(nom: string) {
  return db.user.create({
    data: { name: nom, email: unique(nom).toLowerCase() + "@test.local", passwordHash: "test", role: "AGENT" },
  });
}

interface EnqueteCreee {
  versionId: string;
  keys: string[];
}

async function creerEnquetePubliee(
  titre: string,
  numero: number,
  opts?: { publishedAt?: Date },
): Promise<EnqueteCreee> {
  const createur = await db.user.findFirst({ where: { role: "AGENT" } });
  const enquete = await db.survey.create({
    data: { title: titre, createdById: createur!.id },
  });
  const version = await db.surveyVersion.create({
    data: { surveyId: enquete.id, versionNumber: numero, status: "BROUILLON" },
  });
  await db.question.create({
    data: {
      surveyVersionId: version.id,
      key: "intentions_vote",
      text: "Si des élections avaient lieu aujourd'hui, comment compteriez-vous voter ?",
      type: "CHOIX_UNIQUE",
      required: true,
      order: 1,
      options: {
        create: [
          { label: "Option A", value: "a", order: 1 },
          { label: "Option B", value: "b", order: 2 },
        ],
      },
    },
  });
  await db.question.create({
    data: {
      surveyVersionId: version.id,
      key: "age",
      text: "Quel est votre âge ?",
      type: "NOMBRE",
      required: true,
      order: 2,
      configuration: { nombreMin: 18, nombreMax: 120 },
    },
  });
  await db.surveyVersion.update({
    where: { id: version.id },
    data: { status: "PUBLIEE", publishedAt: opts?.publishedAt ?? new Date() },
  });
  return { versionId: version.id, keys: ["intentions_vote", "age"] };
}

async function creerRepondants(n: number): Promise<{ id: string }[]> {
  const repondants: { id: string }[] = [];
  for (let i = 0; i < n; i++) {
    const r = await db.respondent.create({
      data: { name: `Répondant ${unique("R")}`, phone: `+509 31${i} 00 00`, externalRef: `RESP-${unique(String(i))}` },
    });
    repondants.push({ id: r.id });
  }
  return repondants;
}

const REPONSES_VALIDES = {
  intentions_vote: { choix: ["a"] },
  age: { nombre: 42 },
};

beforeEach(async () => {
  await db.$executeRawUnsafe(`
    TRUNCATE "AuditLog", "AgentSession", "Answer", "CallAttempt", "Interview",
             "QualityFlag", "QuestionOption", "Question", "Respondent",
             "SurveyVersion", "Survey", "User" CASCADE
  `);
});

describe("Workflow agent — attribution (interview-first)", () => {
  it("crée l'appel ET l'entretien attaché à la version publiée exacte", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    const [repondant] = await creerRepondants(1);

    const attribution = await attribuerProchainRepondant(agentA.id);
    expect(attribution).not.toBeNull();
    expect(attribution!.reprise).toBe(false);
    expect(attribution!.appel.respondentId).toBe(repondant.id);
    expect(attribution!.appel.attemptNumber).toBe(1);
    expect(attribution!.appel.status).toBe("EN_COURS");
    expect(attribution!.entretien.status).toBe("EN_COURS");
    expect(attribution!.entretien.callAttemptId).toBe(attribution!.appel.id);
    expect(attribution!.entretien.surveyVersionId).toBeTruthy();
    // Respondent locked by exactly one agent:
    const apres = await db.respondent.findUnique({ where: { id: repondant.id } });
    expect(apres!.status).toBe("EN_COURS");
    expect(apres!.assignedToId).toBe(agentA.id);
  });

  it("échoue proprement sans enquête publiée (message français, aucun état créé)", async () => {
    const agentA = await creerAgent("Agent A");
    await creerRepondants(1);
    await expect(attribuerProchainRepondant(agentA.id)).rejects.toThrow(/aucune enquête publiée/i);
    expect(await db.callAttempt.count()).toBe(0);
    expect(await db.interview.count()).toBe(0);
  });

  it("retourne null quand la file est vide", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    expect(await attribuerProchainRepondant(agentA.id)).toBeNull();
  });

  it("n'assigne jamais deux fois le même répondant à deux agents (SKIP LOCKED)", async () => {
    const agentA = await creerAgent("Agent A");
    const agentB = await creerAgent("Agent B");
    await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(2);

    const [a, b] = await Promise.all([
      attribuerProchainRepondant(agentA.id),
      attribuerProchainRepondant(agentB.id),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.repondant.id).not.toBe(b!.repondant.id);
    expect(a!.entretien.id).not.toBe(b!.entretien.id);
    expect(await db.callAttempt.count({ where: { status: "EN_COURS" } })).toBe(2);
  });

  it("les requêtes en double du même agent ne créent pas de travail dupliqué", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(2);

    const resultats = await Promise.allSettled([
      attribuerProchainRepondant(agentA.id),
      attribuerProchainRepondant(agentA.id),
    ]);
    const reussies = resultats
      .filter((r): r is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof attribuerProchainRepondant>>>> =>
        r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);
    const entrevuesUniques = new Set(reussies.map((r) => r.entretien.id));
    expect(entrevuesUniques.size).toBe(1);
    expect(await db.callAttempt.count({ where: { agentId: agentA.id, status: "EN_COURS" } })).toBe(1);
    expect(await db.interview.count({ where: { agentId: agentA.id } })).toBeLessThanOrEqual(1);
  });
});

describe("Workflow agent — reprise", () => {
  it("reprend le même entretien avec les réponses sauvegardées intactes", async () => {
    const agentA = await creerAgent("Agent A");
    const { versionId } = await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(1);

    const premiere = await attribuerProchainRepondant(agentA.id);
    expect(premiere).not.toBeNull();
    await enregistrerReponse({
      agentId: agentA.id,
      interviewId: premiere!.entretien.id,
      questionKey: "intentions_vote",
      valeurBrute: { choix: ["b"] },
    });

    // Simulates leaving the page and coming back (dashboard resume).
    const reprise = await attribuerProchainRepondant(agentA.id);
    expect(reprise).not.toBeNull();
    expect(reprise!.reprise).toBe(true);
    expect(reprise!.entretien.id).toBe(premiere!.entretien.id);
    expect(reprise!.entretien.surveyVersionId).toBe(versionId);

    const reponses = await db.answer.findMany({ where: { interviewId: premiere!.entretien.id } });
    expect(reponses).toHaveLength(1);
    expect(reponses[0].questionKey).toBe("intentions_vote");
    expect(reponses[0].choiceValues).toEqual(["b"]);
  });
});

describe("Workflow agent — soumission & dispositions", () => {
  it("soumission atomique : entretien TERMINE + appel TERMINE + répondant INTERROGE, puis répondant suivant", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(2);

    const attribution = (await attribuerProchainRepondant(agentA.id))!;
    const resultat = await soumettreEntretien({
      agentId: agentA.id,
      interviewId: attribution.entretien.id,
      reponsesBrutes: REPONSES_VALIDES,
    });
    expect(resultat.dureeSecondes).toBeGreaterThanOrEqual(0);

    const entretien = await db.interview.findUnique({ where: { id: attribution.entretien.id } });
    expect(entretien!.status).toBe("TERMINE");
    const appel = await db.callAttempt.findUnique({ where: { id: attribution.appel.id } });
    expect(appel!.status).toBe("TERMINE");
    const repondant = await db.respondent.findUnique({ where: { id: attribution.repondant.id } });
    expect(repondant!.status).toBe("INTERROGE");

    // Next respondent — a NEW call attempt + interview are created.
    const suivant = await attribuerProchainRepondant(agentA.id);
    expect(suivant).not.toBeNull();
    expect(suivant!.reprise).toBe(false);
    expect(suivant!.repondant.id).not.toBe(attribution.repondant.id);
    expect(suivant!.entretien.id).not.toBe(attribution.entretien.id);
  });

  it("double soumission rejetée (état invalide)", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(1);

    const attribution = (await attribuerProchainRepondant(agentA.id))!;
    await soumettreEntretien({
      agentId: agentA.id,
      interviewId: attribution.entretien.id,
      reponsesBrutes: REPONSES_VALIDES,
    });
    await expect(
      soumettreEntretien({
        agentId: agentA.id,
        interviewId: attribution.entretien.id,
        reponsesBrutes: REPONSES_VALIDES,
      }),
    ).rejects.toThrow(/déjà/);
  });

  it("REFUS : entretien JAMAIS soumis comme terminé, répondant exclu", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(1);

    const attribution = (await attribuerProchainRepondant(agentA.id))!;
    await cloturerAppelSansEntretien({
      agentId: agentA.id,
      interviewId: attribution.entretien.id,
      statut: "REFUS",
    });

    const entretien = await db.interview.findUnique({ where: { id: attribution.entretien.id } });
    expect(entretien!.status).toBe("ABANDONNE");
    const appel = await db.callAttempt.findUnique({ where: { id: attribution.appel.id } });
    expect(appel!.status).toBe("REFUS");
    const repondant = await db.respondent.findUnique({ where: { id: attribution.repondant.id } });
    expect(repondant!.status).toBe("EXCLU");
  });

  it("RAPPEL : callback planifié via le backend existant ; date passée rejetée (transaction annulée)", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    const [r1, r2] = await creerRepondants(2);

    // Invalid callback date → nothing is mutated.
    const tentative = (await attribuerProchainRepondant(agentA.id))!;
    await expect(
      cloturerAppelSansEntretien({
        agentId: agentA.id,
        interviewId: tentative.entretien.id,
        statut: "RAPPEL",
        rappelDate: "2020-01-01",
        rappelHeure: "10:00",
      }),
    ).rejects.toThrow(/futur/);
    expect((await db.interview.findUnique({ where: { id: tentative.entretien.id } }))!.status).toBe("EN_COURS");

    await cloturerAppelSansEntretien({
      agentId: agentA.id,
      interviewId: tentative.entretien.id,
      statut: "RAPPEL",
      rappelDate: "2099-01-01",
      rappelHeure: "10:00",
    });
    const appel = await db.callAttempt.findUnique({ where: { id: tentative.appel.id } });
    expect(appel!.status).toBe("RAPPEL");
    expect(appel!.callbackAt).not.toBeNull();
    const repondant = await db.respondent.findUnique({ where: { id: r1.id } });
    expect(repondant!.status).toBe("RAPPEL_PLANIFIE");

    // The queue skips both the rappel-planned and excluded respondents.
    const suivant = await attribuerProchainRepondant(agentA.id);
    expect(suivant!.repondant.id).toBe(r2.id);
  });

  it("abandon explicite : appel fermé, répondant remis dans la file", async () => {
    const agentA = await creerAgent("Agent A");
    await creerEnquetePubliee("Opinion politique", 1);
    const [r1] = await creerRepondants(1);

    const attribution = (await attribuerProchainRepondant(agentA.id))!;
    await abandonnerEntretien({ agentId: agentA.id, interviewId: attribution.entretien.id });

    const entretien = await db.interview.findUnique({ where: { id: attribution.entretien.id } });
    expect(entretien!.status).toBe("ABANDONNE");
    const appel = await db.callAttempt.findUnique({ where: { id: attribution.appel.id } });
    expect(appel!.status).toBe("ABANDONNE");
    expect((await db.respondent.findUnique({ where: { id: r1.id } }))!.status).toBe("DISPONIBLE");

    // Re-assignment creates a FRESH attempt for the same respondent.
    const nouvelle = await attribuerProchainRepondant(agentA.id);
    expect(nouvelle!.repondant.id).toBe(r1.id);
    expect(nouvelle!.appel.attemptNumber).toBe(2);
    expect(nouvelle!.entretien.id).not.toBe(attribution.entretien.id);
  });
});

describe("Autorisation — cloisonnement strict par agent", () => {
  it("l'agent B ne peut ni répondre, ni soumettre, ni clôturer l'entretien de l'agent A", async () => {
    const agentA = await creerAgent("Agent A");
    const agentB = await creerAgent("Agent B");
    await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(1);

    const attribution = (await attribuerProchainRepondant(agentA.id))!;
    const idEntretien = attribution.entretien.id;

    await expect(
      enregistrerReponse({ agentId: agentB.id, interviewId: idEntretien, questionKey: "age", valeurBrute: { nombre: 30 } }),
    ).rejects.toThrow(AppError);

    await expect(
      soumettreEntretien({ agentId: agentB.id, interviewId: idEntretien, reponsesBrutes: REPONSES_VALIDES }),
    ).rejects.toThrow(AppError);

    await expect(
      cloturerAppelSansEntretien({ agentId: agentB.id, interviewId: idEntretien, statut: "REFUS" }),
    ).rejects.toThrow(AppError);

    // Nothing was mutated by the unauthorized attempts.
    expect(await db.answer.count({ where: { interviewId: idEntretien } })).toBe(0);
    expect((await db.interview.findUnique({ where: { id: idEntretien } }))!.status).toBe("EN_COURS");
  });
});

describe("Intégrité des versions — l'entretien reste fidèle à sa version", () => {
  it("une nouvelle version publiée ne mute pas l'entretien en cours ; le suivant utilise la nouvelle", async () => {
    const agentA = await creerAgent("Agent A");
    const v1 = await creerEnquetePubliee("Opinion politique", 1);
    await creerRepondants(2);

    const attribution = (await attribuerProchainRepondant(agentA.id))!;
    expect(attribution.entretien.surveyVersionId).toBe(v1.versionId);

    // Manager publishes v2 while the interview is in progress.
    await creerEnquetePubliee("Opinion politique", 2, { publishedAt: new Date(Date.now() + 1000) });
    await enregistrerReponse({
      agentId: agentA.id,
      interviewId: attribution.entretien.id,
      questionKey: "intentions_vote",
      valeurBrute: { choix: ["a"] },
    });
    expect((await db.interview.findUnique({ where: { id: attribution.entretien.id } }))!.surveyVersionId).toBe(
      v1.versionId,
    );

    await soumettreEntretien({
      agentId: agentA.id,
      interviewId: attribution.entretien.id,
      reponsesBrutes: REPONSES_VALIDES,
    });

    // Next respondent → pinned to the NEW version.
    const suivant = await attribuerProchainRepondant(agentA.id);
    expect(suivant!.entretien.surveyVersionId).not.toBe(v1.versionId);
  });
});
