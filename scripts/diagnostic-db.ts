/**
 * UNITED Research — Database diagnostics.
 * Checks: connection, schema presence, user count, admin account presence.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("=== 1. Connexion à la base ===");
  try {
    await db.$connect();
    console.log("✓ Connexion OK");
  } catch (e) {
    console.error("✗ Échec connexion:", e);
    process.exit(1);
  }

  console.log("\n=== 2. Tables présentes ===");
  const tables = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name;
  `;
  for (const t of tables) console.log(`  - ${t.table_name}`);
  console.log(`Total: ${tables.length} tables`);

  console.log("\n=== 3. Compteur d'enregistrements par table ===");
  for (const table of ["User", "Survey", "SurveyVersion", "Question", "Respondent",
                       "CallAttempt", "Interview", "Answer", "AuditLog",
                       "AgentSession", "QualityFlag", "QuestionOption"]) {
    try {
      const count = await db.$queryRaw<{count: bigint}[]>`
        SELECT COUNT(*)::bigint as count FROM "${table}";
      `;
      console.log(`  ${table}: ${count[0].count}`);
    } catch (e) {
      console.log(`  ${table}: ERREUR (${e})`);
    }
  }

  console.log("\n=== 4. Comptes utilisateurs ===");
  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });
  if (users.length === 0) {
    console.log("  ⚠ AUCUN utilisateur dans la base — la base est vide!");
  } else {
    for (const u of users) {
      console.log(`  - ${u.email} | ${u.name} | ${u.role} | actif=${u.active} | créé=${u.createdAt.toISOString()}`);
    }
  }

  console.log("\n=== 5. Recherche admin spécifique ===");
  const admin = await db.user.findUnique({
    where: { email: "admin@united-research.ht" },
    select: { id: true, email: true, name: true, role: true, active: true,
              passwordHash: true, createdAt: true },
  });
  if (!admin) {
    console.log("  ✗ admin@united-research.ht n'existe PAS dans la base");
  } else {
    console.log(`  ✓ admin@united-research.ht trouvé:`);
    console.log(`    ID: ${admin.id}`);
    console.log(`    Rôle: ${admin.role}`);
    console.log(`    Actif: ${admin.active}`);
    console.log(`    Hash présent: ${admin.passwordHash ? "OUI (longueur=" + admin.passwordHash.length + ")" : "NON"}`);
    console.log(`    Hash prefix: ${admin.passwordHash?.substring(0, 7)}... (devrait être $2a$10$ ou $2b$10$)`);
    console.log(`    Créé: ${admin.createdAt.toISOString()}`);
  }

  // Test de vérification du mot de passe
  if (admin?.passwordHash) {
    console.log("\n=== 6. Test du mot de passe Démo2026! ===");
    const bcrypt = await import("bcryptjs");
    const ok = await bcrypt.compare("Démo2026!", admin.passwordHash);
    console.log(`  Résultat bcrypt.compare("Démo2026!", hash): ${ok ? "✓ VALIDE" : "✗ INVALIDE"}`);
  }
}

main()
  .catch((e) => { console.error("Erreur fatale:", e); process.exit(1); })
  .finally(() => db.$disconnect());
