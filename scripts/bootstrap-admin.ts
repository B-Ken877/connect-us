/**
 * UNITED Research — Admin bootstrap script.
 * Creates the first admin account on a fresh database.
 * Run: DATABASE_URL="..." bun scripts/bootstrap-admin.ts
 *
 * The script is IDEMPOTENT: if the admin already exists, it just reports it.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ADMIN_EMAIL = "admin@united-research.ht";
const ADMIN_NAME = "Administrateur";
const ADMIN_PASSWORD = "Démo2026!";

async function main() {
  console.log("→ Recherche d'un compte admin existant…");
  const existing = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    console.log(`✓ Le compte admin existe déjà (id=${existing.id}, actif=${existing.active}).`);
    console.log(`  Email: ${existing.email}`);
    console.log(`  Rôle:  ${existing.role}`);
    return;
  }

  console.log("→ Hachage du mot de passe (bcrypt, coût 10)…");
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  console.log("→ Création du compte admin…");
  const admin = await db.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: hash,
      role: "ADMINISTRATEUR",
      active: true,
    },
  });

  console.log("\n✓ Compte admin créé avec succès.");
  console.log(`  ID:       ${admin.id}`);
  console.log(`  Email:    ${admin.email}`);
  console.log(`  Rôle:     ${admin.role}`);
  console.log(`  Actif:    ${admin.active}`);
  console.log(`  Créé le:  ${admin.createdAt.toISOString()}`);
  console.log("\n→ Connexion:");
  console.log(`  URL:      /connexion`);
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Mot de passe: ${ADMIN_PASSWORD}`);
  console.log("\n⚠ Sécurité: changez ce mot de passe après la première connexion.");
}

main()
  .catch((err) => {
    console.error("✗ Erreur:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
