import { PrismaClient } from "@prisma/client";
if (!process.env.DATABASE_URL?.startsWith("postgres")) process.env.DATABASE_URL = "postgresql://gig:gig@127.0.0.1:5433/gig_survey?schema=public";
const db = new PrismaClient();
const dernier = await db.interview.findFirst({
  orderBy: { startedAt: "desc" },
  include: { answers: true, callAttempt: true, agent: { select: { name: true } }, respondent: { select: { name: true, status: true } }, surveyVersion: { select: { versionNumber: true } } },
});
if (dernier) {
  console.log("=== VERTICAL SLICE — VÉRIFICATION BASE DE DONNÉES ===");
  console.log("Répondant      :", dernier.respondent.name, "→ statut:", dernier.respondent.status);
  console.log("Agent          :", dernier.agent.name);
  console.log("Version enquête: v" + dernier.surveyVersion.versionNumber);
  console.log("Appel          :", dernier.callAttempt ? `tentative #${dernier.callAttempt.attemptNumber}, statut ${dernier.callAttempt.status}, durée ${dernier.callAttempt.durationSeconds}s` : "ABSENT");
  console.log("Entretien      :", dernier.status, "| durée:", dernier.durationSeconds + "s");
  console.log("Réponses       :", dernier.answers.length, "→ clés:", dernier.answers.map(a => a.questionKey).sort().join(", "));
  const flags = await db.qualityFlag.count({ where: { interviewId: dernier.id } });
  console.log("Signalements   :", flags);
}
await db.$disconnect();
