import { PrismaClient } from "@prisma/client";
if (!process.env.DATABASE_URL?.startsWith("postgres")) process.env.DATABASE_URL = "postgresql://gig:gig@127.0.0.1:5433/gig_survey?schema=public";
const db = new PrismaClient();

// Reproduit exactement la requête critique du respondent-queue service :
// SELECT ... FOR UPDATE SKIP LOCKED — deux transactions concurrentes ne
// doivent JAMAIS obtenir le même répondant.
async function attribuer(nom: string, delayMs: number): Promise<string> {
  return db.$transaction(async (tx) => {
    await new Promise((r) => setTimeout(r, delayMs));
    const lignes = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Respondent"
      WHERE "status" = 'DISPONIBLE'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (!lignes[0]) return "FILE_VIDE";
    await tx.respondent.update({ where: { id: lignes[0].id }, data: { status: "EN_COURS" } });
    console.log(`${nom} a reçu le répondant ${lignes[0].id.slice(-8)}`);
    return lignes[0].id;
  });
}

const [a, b] = await Promise.all([attribuer("Agent A", 0), attribuer("Agent B", 30)]);
if (a !== "FILE_VIDE" && b !== "FILE_VIDE") {
  console.log(a === b ? "!! CONFLIT : MÊME RÉPONDANT !!" : `✓ Aucun conflit : A=${a.slice(-8)} ≠ B=${b.slice(-8)} (SKIP LOCKED)`);
}
// remise en file pour l'état propre
await db.respondent.updateMany({ where: { status: "EN_COURS" }, data: { status: "DISPONIBLE" } });
console.log("(répondants remis en file)");
await db.$disconnect();
