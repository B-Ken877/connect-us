import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";
import { verifierLimite } from "@/lib/rate-limit";
import type { Prisma } from "@prisma/client";

/**
 * Respondent pool management. PII (name / phone) is stored ONLY here —
 * interviews and answers reference the respondent by id, keeping analytical
 * access separable from identity/contact data.
 */

export interface FiltreRepondants {
  recherche?: string;
  statut?: string;
  page?: number;
  parPage?: number;
}

export async function listerRepondants(filtre: FiltreRepondants) {
  const parPage = Math.min(filtre.parPage ?? 25, 100);
  const page = Math.max(1, filtre.page ?? 1);
  const where = {
    ...(filtre.statut && filtre.statut !== "TOUS"
      ? { status: filtre.statut as never }
      : {}),
    ...(filtre.recherche
      ? {
          OR: [
            { name: { contains: filtre.recherche, mode: "insensitive" as const } },
            { phone: { contains: filtre.recherche } },
            { externalRef: { contains: filtre.recherche } },
          ],
        }
      : {}),
  };
  const [total, repondants] = await Promise.all([
    db.respondent.count({ where }),
    db.respondent.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * parPage,
      take: parPage,
      include: { assignedTo: { select: { name: true } }, _count: { select: { callAttempts: true } } },
    }),
  ]);
  return { total, page, parPage, pages: Math.ceil(total / parPage), repondants };
}

export async function creerRepondant(params: {
  acteurId: string;
  externalRef?: string;
  name?: string;
  phone: string;
  metadata?: Record<string, unknown>;
}) {
  const repondant = await db.respondent.create({
    data: {
      externalRef: params.externalRef || null,
      name: params.name || null,
      phone: params.phone,
      metadata: params.metadata
        ? (params.metadata as Prisma.InputJsonValue)
        : undefined,
      status: "DISPONIBLE",
    },
  });
  await enregistrerAudit({
    userId: params.acteurId,
    action: ACTIONS_AUDIT.RESPONDANT_CREE,
    entityType: "Respondent",
    entityId: repondant.id,
  });
  return repondant;
}

export async function majRepondant(params: {
  acteurId: string;
  repondantId: string;
  externalRef?: string;
  name?: string;
  phone?: string;
  status?: "DISPONIBLE" | "INJOIGNABLE" | "EXCLU";
}) {
  const existant = await db.respondent.findUnique({ where: { id: params.repondantId } });
  if (!existant) throw new AppError("INTROUVABLE", "Répondant introuvable.");
  if (existant.status === "EN_COURS") {
    throw new AppError("ETAT_INVALIDE", "Ce répondant est actuellement en cours d'appel.");
  }
  const repondant = await db.respondent.update({
    where: { id: params.repondantId },
    data: {
      ...(params.externalRef !== undefined ? { externalRef: params.externalRef || null } : {}),
      ...(params.name !== undefined ? { name: params.name || null } : {}),
      ...(params.phone !== undefined ? { phone: params.phone } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
  });
  if (params.status === "EXCLU") {
    await enregistrerAudit({
      userId: params.acteurId,
      action: ACTIONS_AUDIT.RESPONDANT_EXCLU,
      entityType: "Respondent",
      entityId: repondant.id,
    });
  }
  return repondant;
}

/**
 * Bulk import from pasted CSV-ish lines: "Nom;Téléphone" per line.
 * Rate-limited because it is a mass-write endpoint.
 */
export async function importerRepondants(params: { acteurId: string; contenu: string }) {
  const limite = verifierLimite(`import-repondants:${params.acteurId}`, 10, 60_000);
  if (!limite.autorise) throw new AppError("LIMITE_ATTEINTE");

  const lignes = params.contenu
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const valides: { name: string | null; phone: string }[] = [];
  for (const ligne of lignes) {
    const morceaux = ligne.split(/[;,\t]/).map((m) => m.trim());
    if (morceaux.length < 2 || !morceaux[1]) continue;
    if (!/^[\d+\s().-]{6,25}$/.test(morceaux[1])) continue;
    valides.push({ name: morceaux[0] || null, phone: morceaux[1] });
  }
  if (valides.length === 0) {
    throw new AppError("VALIDATION", "Aucune ligne valide détectée. Format attendu : « Nom;Téléphone » (une ligne par répondant).");
  }

  const crees = await db.$transaction(async (tx) => {
    const resultats: { id: string }[] = [];
    for (const v of valides) {
      const existe = await tx.respondent.findFirst({ where: { phone: v.phone } });
      if (existe) continue; // idempotent import on phone number
      resultats.push(await tx.respondent.create({ data: { name: v.name, phone: v.phone, status: "DISPONIBLE" } }));
    }
    return resultats;
  });

  await enregistrerAudit({
    userId: params.acteurId,
    action: "RESPONDANTS_IMPORTES",
    entityType: "Respondent",
    metadata: { soumis: valides.length, crees: crees.length },
  });
  return { soumis: valides.length, crees: crees.length };
}
