/**
 * GIG SURVEY — development seed.
 * All content (names, numbers, political options) is FICTIONAL demo data.
 * Run: bun run seed
 */
import { PrismaClient, TypeQuestion } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

// Sandbox shells may export a legacy DATABASE_URL (SQLite) that overrides
// .env — restore the PostgreSQL URL from .env when the process-level one is
// missing or file-based. Production envs are unaffected.
if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith("postgres")) {
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]*)"?\s*$/);
      if (m?.[1]?.startsWith("postgres")) {
        process.env.DATABASE_URL = m[1];
        break;
      }
    }
  }
}

const db = new PrismaClient();

const MOT_DE_PASSE = "Démo2026!";

async function principal() {
  console.log("→ Nettoyage (TRUNCATE — contourne volontairement les gardes d'immutabilité en dev)…");
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog", "QualityFlag", "Answer", "Interview", "CallAttempt",
      "AgentSession", "QuestionOption", "Question", "SurveyVersion", "Survey",
      "Respondent", "User"
    RESTART IDENTITY CASCADE
  `);

  console.log("→ Utilisateurs…");
  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const [admin, agent1, agent2, agent3] = await Promise.all([
    db.user.create({ data: { name: "Sophie Marchand", email: "admin@gig-survey.fr", role: "ADMINISTRATEUR", passwordHash: hash } }),
    db.user.create({ data: { name: "Camille Fournier", email: "agent1@gig-survey.fr", role: "AGENT", passwordHash: hash } }),
    db.user.create({ data: { name: "Hugo Bertrand", email: "agent2@gig-survey.fr", role: "AGENT", passwordHash: hash } }),
    db.user.create({ data: { name: "Inès Roussel", email: "agent3@gig-survey.fr", role: "AGENT", passwordHash: hash } }),
  ]);

  console.log("→ Répondants (fictifs)…");
  const nomsRepondants = [
    "Alain Perrot", "Bernadette Colin", "Cédric Lamy", "Danièle Aubry", "Émile Vasseur",
    "Fabienne Guyon", "Gérard Teissier", "Hélène Marchal", "Ismaël Diallo", "Josiane Rey",
    "Karl Lambert", "Lucie Pichon", "Michel Sabatier", "Nora Chastain", "Olivier Bréart",
    "Patrice Guillon", "Quentin Ravel", "Rosa Jimenez", "Sylvain Ollier", "Thérèse Monteil",
    "Ulysse Ferrand", "Valérie Estève", "Wilfried Donnet", "Xavière Prat",
    "Yannick Gosse", "Zoé Malandain", "Adrien Couston", "Brigitte Sagnes", "Christophe Rieu", "Delphine Galzy",
  ];
  const repondants: { id: string }[] = [];
  for (let i = 0; i < nomsRepondants.length; i++) {
    const numero = `0${6 + (i % 2)} ${String(10 + i).padStart(2, "0")} ${String(20 + i)} ${String(30 + i % 70).padStart(2, "0")} ${String(40 + (i * 3) % 60).padStart(2, "0")}`;
    repondants.push(
      await db.respondent.create({
        data: {
          name: nomsRepondants[i],
          phone: numero,
          externalRef: `DEMO-${String(i + 1).padStart(4, "0")}`,
          status: "DISPONIBLE",
        },
      }),
    );
  }

  console.log("→ Enquête de démonstration (10 questions + logique conditionnelle)…");
  const enquete = await db.survey.create({
    data: {
      title: "Enquête politique — Démonstration",
      description:
        "Questionnaire de démonstration à contenu fictif. Les candidats et propositions cités sont imaginaires et servent uniquement à tester la plateforme.",
      status: "BROUILLON",
      createdById: admin.id,
    },
  });

  const version1 = await db.surveyVersion.create({
    data: {
      surveyId: enquete.id,
      versionNumber: 1,
      status: "BROUILLON",
      config: {
        dureeAttendueSecondes: 420,
        reglesCoherence: [
          {
            id: "age_emploi",
            message: "Âge inférieur à 16 ans mais déclare occuper un emploi.",
            si: { questionKey: "age", operateur: "INFERIEUR", valeur: 16 },
            alorsIncompatibleAvec: { questionKey: "emploi", operateur: "EGAL", valeur: "oui" },
          },
        ],
      },
    },
  });

  type Q = {
    key: string;
    text: string;
    helpText?: string;
    type: TypeQuestion;
    required?: boolean;
    configuration?: Record<string, unknown>;
    conditionalLogic?: Record<string, unknown>;
    options?: { label: string; value: string }[];
  };

  const questions: Q[] = [
    { key: "age", text: "Quel âge avez-vous ?", helpText: "Âge en années révolues.", type: "NOMBRE", required: true, configuration: { nombreMin: 14, nombreMax: 120, entier: true, unite: "ans" } },
    {
      key: "sexe", text: "Êtes-vous un homme ou une femme ?", type: "CHOIX_UNIQUE", required: true,
      options: [{ label: "Homme", value: "homme" }, { label: "Femme", value: "femme" }, { label: "Autre / ne souhaite répondre", value: "autre" }],
    },
    {
      key: "inscrit", text: "Êtes-vous inscrit sur les listes électorales ?", type: "OUI_NON", required: true,
    },
    {
      key: "interet", text: "De manière générale, vous intéressez-vous à la politique ?", type: "ECHELLE", required: true,
      configuration: { echelleMin: 0, echelleMax: 10, echelleMinLibelle: "Pas du tout", echelleMaxLibelle: "Beaucoup" },
    },
    {
      key: "intention", text: "Si une élection présidentielle avait lieu dimanche, pour lequel voteriez-vous au premier tour ?",
      helpText: "Répondez spontanément — liste fictive de démonstration.", type: "CHOIX_UNIQUE", required: true,
      options: [
        { label: "Candidat A (fictif)", value: "candidat_a" },
        { label: "Candidat B (fictif)", value: "candidat_b" },
        { label: "Candidate C (fictive)", value: "candidat_c" },
        { label: "Vote blanc ou nul", value: "blanc" },
        { label: "Ne se prononce pas", value: "nspp" },
      ],
    },
    {
      key: "confiance", text: "Avez-vous confiance dans les institutions démocratiques de notre pays ?", type: "ECHELLE", required: true,
      configuration: { echelleMin: 0, echelleMax: 10, echelleMinLibelle: "Aucune confiance", echelleMaxLibelle: "Confiance totale" },
    },
    {
      key: "emploi", text: "Travaillez-vous actuellement ?", type: "OUI_NON", required: true,
    },
    {
      key: "secteur", text: "Dans quel secteur travaillez-vous ?", type: "CHOIX_UNIQUE", required: true,
      conditionalLogic: { operateurLogique: "ET", conditions: [{ questionKey: "emploi", operateur: "EGAL", valeur: "oui" }] },
      options: [
        { label: "Secteur public", value: "public" },
        { label: "Secteur privé", value: "prive" },
        { label: "Indépendant / entrepreneur", value: "independant" },
      ],
    },
    {
      key: "priorites", text: "Parmi les thèmes suivants, lesquels sont prioritaires pour vous ? (plusieurs réponses possibles)",
      type: "CHOIX_MULTIPLE", required: true,
      options: [
        { label: "Pouvoir d'achat", value: "pouvoir_achat" },
        { label: "Santé", value: "sante" },
        { label: "Éducation", value: "education" },
        { label: "Sécurité", value: "securite" },
        { label: "Environnement", value: "environnement" },
        { label: "Emploi", value: "emploi" },
      ],
    },
    { key: "commentaire", text: "Souhaitez-vous ajouter un commentaire libre ?", type: "TEXTE_LONG", required: false, configuration: { texteMax: 1000, placeholder: "Votre commentaire…" } },
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await db.question.create({
      data: {
        surveyVersionId: version1.id,
        key: q.key,
        text: q.text,
        helpText: q.helpText,
        type: q.type,
        required: q.required ?? false,
        order: i,
        configuration: q.configuration ? (q.configuration as never) : undefined,
        conditionalLogic: q.conditionalLogic ? (q.conditionalLogic as never) : undefined,
        options: q.options ? { create: q.options.map((o, j) => ({ ...o, order: j })) } : undefined,
      },
    });
  }

  console.log("→ Publication de la version 1…");
  await db.surveyVersion.update({
    where: { id: version1.id },
    data: { status: "PUBLIEE", publishedAt: new Date() },
  });
  await db.survey.update({ where: { id: enquete.id }, data: { status: "PUBLIEE" } });

  console.log("→ Appels & entretiens de démonstration…");
  const questionsCreees = await db.question.findMany({
    where: { surveyVersionId: version1.id },
    include: { options: true },
    orderBy: { order: "asc" },
  });
  const qParCle = new Map(questionsCreees.map((q) => [q.key, q]));

  // 4 jours d'historique, plusieurs agents
  const maintenant = Date.now();
  const jours = [4, 3, 2, 1, 0];

  function reponseAleatoire(question: (typeof questionsCreees)[number], profil: number) {
    const v: Record<string, unknown> = {};
    switch (question.key) {
      case "age":
        v.nombre = [42, 55, 31, 67, 24][profil % 5];
        break;
      case "sexe":
        v.choix = [question.options[profil % question.options.length].value];
        break;
      case "inscrit":
        v.booleen = true;
        break;
      case "interet":
        v.nombre = [6, 3, 8, 5, 2][profil % 5];
        break;
      case "intention":
        v.choix = [question.options[profil % question.options.length].value];
        break;
      case "confiance":
        v.nombre = [4, 7, 3, 6, 5][profil % 5];
        break;
      case "emploi":
        v.booleen = profil % 3 !== 1;
        break;
      case "secteur":
        v.choix = ["public", "prive", "independant"][profil % 3];
        v.choix = [v.choix];
        break;
      case "priorites":
        v.choix = ["pouvoir_achat", profil % 2 === 0 ? "sante" : "environnement"];
        break;
      case "commentaire":
        if (profil % 2 === 0) v.texte = "Aucun commentaire particulier (démo).";
        break;
    }
    return v;
  }

  let compteurEntretien = 0;
  const agents = [agent1, agent2, agent3];

  for (const [indexJour, joursDepuis] of jours.entries()) {
    const nbDuJour = indexJour === 0 ? 2 : 3;
    for (let k = 0; k < nbDuJour; k++) {
      const agent = agents[(indexJour + k) % agents.length];
      const repondant = repondants[compteurEntretien % repondants.length];
      const profil = compteurEntretien % 5;
      const debut = new Date(maintenant - joursDepuis * 86_400_000 - (k + 1) * 3_600_000);

      const appel = await db.callAttempt.create({
        data: {
          respondentId: repondant.id,
          agentId: agent.id,
          status: "TERMINE",
          startedAt: debut,
          endedAt: new Date(debut.getTime() + 120_000),
          durationSeconds: 120,
          attemptNumber: 1,
          notes: k === 1 ? "Démo — appel fictif." : null,
        },
      });

      const dureeEntretien = compteurEntretien === 3 ? 45 : 300 + profil * 40; // un entretien suspect rapide
      const entretien = await db.interview.create({
        data: {
          respondentId: repondant.id,
          surveyVersionId: version1.id,
          agentId: agent.id,
          callAttemptId: appel.id,
          status: "TERMINE",
          startedAt: new Date(appel.endedAt!.getTime() + 5_000),
          completedAt: new Date(appel.endedAt!.getTime() + 5_000 + dureeEntretien * 1000),
          durationSeconds: dureeEntretien,
          qualityStatus: "NON_EXAMINE",
        },
      });

      const reponses: Record<string, unknown> = {};
      for (const question of questionsCreees) {
        const valeur = reponseAleatoire(question, profil);
        reponses[question.key] = valeur;
        await db.answer.create({
          data: {
            interviewId: entretien.id,
            questionId: question.id,
            questionKey: question.key,
            textValue: (valeur.texte as string) ?? null,
            numberValue: (valeur.nombre as number) ?? null,
            boolValue: (valeur.booleen as boolean) ?? null,
            choiceValues: (valeur.choix as string[]) ?? [],
          },
        });
      }
      await db.respondent.update({ where: { id: repondant.id }, data: { status: "INTERROGE" } });
      compteurEntretien++;
    }
  }

  // Appels sans entretien : refus, rappel, sans réponse
  const repondantRefus = repondants[20];
  await db.callAttempt.create({
    data: {
      respondentId: repondantRefus.id,
      agentId: agent2.id,
      status: "REFUS",
      startedAt: new Date(maintenant - 86_400_000),
      endedAt: new Date(maintenant - 86_400_000 + 60_000),
      durationSeconds: 60,
      attemptNumber: 1,
      notes: "Refus catégorique (démo).",
    },
  });
  await db.respondent.update({ where: { id: repondantRefus.id }, data: { status: "EXCLU" } });

  const repondantRappel = repondants[21];
  await db.callAttempt.create({
    data: {
      respondentId: repondantRappel.id,
      agentId: agent1.id,
      status: "RAPPEL",
      startedAt: new Date(maintenant - 43_200_000),
      endedAt: new Date(maintenant - 43_200_000 + 90_000),
      durationSeconds: 90,
      attemptNumber: 1,
      callbackAt: new Date(maintenant + 86_400_000),
      notes: "Occupée, rappeler demain en fin de journée (démo).",
    },
  });
  await db.respondent.update({ where: { id: repondantRappel.id }, data: { status: "RAPPEL_PLANIFIE" } });

  const repondantAbsent = repondants[22];
  await db.callAttempt.create({
    data: {
      respondentId: repondantAbsent.id,
      agentId: agent3.id,
      status: "SANS_REPONSE",
      startedAt: new Date(maintenant - 20_000_000),
      endedAt: new Date(maintenant - 20_000_000 + 30_000),
      durationSeconds: 30,
      attemptNumber: 1,
    },
  });
  await db.callAttempt.create({
    data: {
      respondentId: repondantAbsent.id,
      agentId: agent3.id,
      status: "OCCUPE",
      startedAt: new Date(maintenant - 10_000_000),
      endedAt: new Date(maintenant - 10_000_000 + 25_000),
      durationSeconds: 25,
      attemptNumber: 2,
    },
  });

  console.log("→ Signalements qualité de démonstration…");
  const entretienRapide = await db.interview.findFirst({ orderBy: { durationSeconds: "asc" } });
  if (entretienRapide) {
    await db.qualityFlag.create({
      data: {
        interviewId: entretienRapide.id,
        agentId: entretienRapide.agentId,
        type: "DUREE_TROP_COURTE",
        severity: "ELEVEE",
        reason: `Entretien réalisé en ${entretienRapide.durationSeconds} s — durée minimale attendue : 90 s (démo).`,
        metadata: { dureeSecondes: entretienRapide.durationSeconds, seuilSecondes: 90 },
        status: "A_EXAMINER",
      },
    });
    await db.interview.update({ where: { id: entretienRapide.id }, data: { qualityStatus: "A_EXAMINER" } });
  }

  const dernierEntretien = await db.interview.findFirst({ orderBy: { createdAt: "desc" } });
  if (dernierEntretien) {
    await db.qualityFlag.create({
      data: {
        interviewId: dernierEntretien.id,
        agentId: dernierEntretien.agentId,
        type: "DOUBLON",
        severity: "FAIBLE",
        reason: "Signalement de démonstration déjà examiné — faux positif (doublon apparent vérifié et infirmé).",
        status: "FAUX_POSITIF",
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewComment: "Vérifié en écoute : entretien conforme (démo).",
      },
    });
  }

  console.log("→ Audit & sessions agents…");
  await db.auditLog.createMany({
    data: [
      { userId: admin.id, action: "ENQUETE_CREEE", entityType: "Survey", entityId: enquete.id, metadata: { titre: enquete.title } },
      { userId: admin.id, action: "ENQUETE_PUBLIEE", entityType: "SurveyVersion", entityId: version1.id, metadata: { versionNumber: 1 } },
      { userId: admin.id, action: "CONNEXION", entityType: "User", entityId: admin.id },
    ],
  });

  await db.agentSession.create({
    data: { agentId: agent1.id, status: "EN_PAUSE", startedAt: new Date(maintenant - 3_600_000), lastActivityAt: new Date(maintenant - 600_000) },
  });

  console.log("\n✓ Seed terminé.");
  console.log("\n   Comptes de démonstration (mot de passe : Démo2026!) :");
  console.log("   - admin@gig-survey.fr         (Administrateur)");
  console.log("   - agent1@gig-survey.fr        (Agent — Camille)");
  console.log("   - agent2@gig-survey.fr        (Agent — Hugo)");
  console.log("   - agent3@gig-survey.fr        (Agent — Inès)");
  void qParCle;
}

principal()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
