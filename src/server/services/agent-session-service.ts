import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Agent presence sessions (supervision states).
 * States: DISPONIBLE / EN_APPEL / EN_ENTRETIEN / EN_PAUSE / HORS_LIGNE.
 * Presence freshness is derived from lastActivityAt (heartbeat) — no
 * WebSockets, compatible with serverless (short polling on the console).
 */
import type { StatutAgent } from "@prisma/client";

const HEARTBEAT_INACTIF_S = 90;

export async function demarrerSessionAgent(agentId: string): Promise<void> {
  const ouverte = await db.agentSession.findFirst({
    where: { agentId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (ouverte) {
    // Resume existing open session — simply flip back to available.
    await db.agentSession.update({
      where: { id: ouverte.id },
      data: { status: "DISPONIBLE", lastActivityAt: new Date() },
    });
    return;
  }
  await db.agentSession.create({ data: { agentId, status: "DISPONIBLE" } });
}

export async function changerEtatSession(
  agentId: string,
  statut: Extract<StatutAgent, "DISPONIBLE" | "EN_PAUSE" | "HORS_LIGNE">,
): Promise<void> {
  const ouverte = await db.agentSession.findFirst({
    where: { agentId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!ouverte) {
    if (statut !== "HORS_LIGNE") throw new AppError("ETAT_INVALIDE", "Aucune session active. Commencez votre session d'abord.");
    return; // going offline without an open session is a no-op
  }
  await db.agentSession.update({
    where: { id: ouverte.id },
    data: {
      status: statut,
      endedAt: statut === "HORS_LIGNE" ? new Date() : null,
      lastActivityAt: new Date(),
    },
  });
}

/** Internal: called by call/interview flows (EN_APPEL ⇄ EN_ENTRETIEN ⇄ DISPONIBLE). */
export async function marquerEtatActivite(agentId: string, statut: StatutAgent): Promise<void> {
  await db.agentSession.updateMany({
    where: { agentId, endedAt: null },
    data: { status: statut, lastActivityAt: new Date() },
  });
}

/** Heartbeat — keeps presence fresh while the agent console is open. */
export async function battement(agentId: string): Promise<void> {
  await db.agentSession.updateMany({
    where: { agentId, endedAt: null },
    data: { lastActivityAt: new Date() },
  });
}

export async function etatSessionAgent(agentId: string): Promise<StatutAgent | "HORS_LIGNE"> {
  const ouverte = await db.agentSession.findFirst({
    where: { agentId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!ouverte) return "HORS_LIGNE";
  const limite = new Date(Date.now() - HEARTBEAT_INACTIF_S * 1000);
  if (ouverte.lastActivityAt < limite && ouverte.status !== "EN_PAUSE") {
    return "HORS_LIGNE"; // stale heartbeat — treated as disconnected for supervision
  }
  return ouverte.status;
}
