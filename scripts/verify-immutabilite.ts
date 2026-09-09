import { PrismaClient } from "@prisma/client";
if (!process.env.DATABASE_URL?.startsWith("postgres")) process.env.DATABASE_URL = "postgresql://gig:gig@127.0.0.1:5433/gig_survey?schema=public";
const db = new PrismaClient();

const v1 = await db.surveyVersion.findFirst({ where: { versionNumber: 1 }, include: { _count: { select: { interviews: true, questions: true } } } });
const v2 = await db.surveyVersion.findFirst({ where: { versionNumber: 2 }, include: { _count: { select: { interviews: true, questions: true } } } });
console.log("v1:", v1?.status, "| questions:", v1?._count.questions, "| entretiens rattachés:", v1?._count.interviews);
console.log("v2:", v2?.status, "| questions:", v2?._count.questions, "| entretiens rattachés:", v2?._count.interviews);

// Tentative de modification d'une question de la v1 (garde PostgreSQL)
const qV1 = await db.question.findFirst({ where: { surveyVersionId: v1!.id } });
try {
  await db.question.update({ where: { id: qV1!.id }, data: { text: "PIRATAGE" } });
  console.log("!! IMMUTABILITÉ VIOLEE !!");
} catch (e) {
  console.log("✓ Modification v1 refusée par la base:", (e as Error).message.slice(0, 110));
}

// Tentative d'ajout d'une option à une question v1
try {
  await db.questionOption.create({ data: { questionId: qV1!.id, label: "PIRATE", value: "pirate", order: 99 } });
  console.log("!! INSERTION VIOLEE !!");
} catch (e) {
  console.log("✓ Insertion option v1 refusée par la base");
}

const qV1Verif = await db.question.findUnique({ where: { id: qV1!.id } });
console.log("✓ Question v1 intacte :", JSON.stringify(qV1Verif?.text));

// Les anciens entretiens pointent toujours vers la v1
const repartition = await db.interview.groupBy({ by: ["surveyVersionId", "status"], _count: true });
console.log("Répartition entretiens par version:", repartition.map(r => `${r.surveyVersionId === v1?.id ? "v1" : "v2"}:${r.status}:${r._count}`).join("  "));

// Les agents interrogent maintenant la v2 (dernière publiée)
await db.$disconnect();
