import "server-only";
import { db } from "@/lib/db";
import { config } from "@/lib/config";

/**
 * METRICS SERVICE — agent statistics & supervisor console feeds.
 * All aggregates are computed with SQL group-bys (no full-table scans into
 * Node). The console refreshes by short polling — no WebSockets (serverless).
 */

const DEBUT_JOUR = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export interface StatsAgent {
  statutSession: string;
  appelsAujourdHui: number;
  entretiensTermines: number;
  rappelsPlanifies: number;
  refus: number;
  sansReponse: number;
  signalementsOuverts: number;
}

export async function statistiquesAgent(agentId: string): Promise<StatsAgent> {
  const debutJour = DEBUT_JOUR();

  const [statutSession, appels, entretiens, rappels, signalements] = await Promise.all([
    db.agentSession
      .findFirst({ where: { agentId, endedAt: null }, orderBy: { startedAt: "desc" } })
      .then((s) => {
        if (!s) return "HORS_LIGNE";
        const limite = new Date(Date.now() - config.supervision.heartbeatSecondes * 1000);
        if (s.lastActivityAt < limite && s.status !== "EN_PAUSE") return "HORS_LIGNE";
        return s.status;
      }),
    db.callAttempt.groupBy({
      by: ["status"],
      where: { agentId, startedAt: { gte: debutJour } },
      _count: true,
    }),
    db.interview.count({
      where: { agentId, status: "TERMINE", completedAt: { gte: debutJour } },
    }),
    db.callAttempt.count({
      where: { agentId, status: "RAPPEL", callbackAt: { gte: debutJour } },
    }),
    db.qualityFlag.count({ where: { agentId, status: "A_EXAMINER" } }),
  ]);

  const parStatut = Object.fromEntries(appels.map((a) => [a.status, a._count]));
  return {
    statutSession,
    appelsAujourdHui: appels.reduce((acc, a) => acc + a._count, 0),
    entretiensTermines: entretiens,
    rappelsPlanifies: rappels,
    refus: parStatut["REFUS"] ?? 0,
    sansReponse: (parStatut["SANS_REPONSE"] ?? 0) + (parStatut["OCCUPE"] ?? 0),
    signalementsOuverts: signalements,
  };
}

export interface LigneAgentSupervision {
  agentId: string;
  nom: string;
  statut: string;
  appels: number;
  entretiens: number;
  refus: number;
  rappels: number;
  dureeMoyenneSecondes: number | null;
  tauxRefus: number; // 0..1
  signalements: number;
}

export interface StatsSupervision {
  genereA: string;
  agentsConnectes: number;
  agentsDisponibles: number;
  agentsEnActivite: number;
  appelsEnCours: number;
  entretiensTermines: number;
  refus: number;
  rappels: number;
  sansReponse: number;
  signalementsOuverts: number;
  repondantsDisponibles: number;
  lignesAgents: LigneAgentSupervision[];
}

export async function statistiquesSupervision(): Promise<StatsSupervision> {
  const debutJour = DEBUT_JOUR();
  const limiteHeartbeat = new Date(Date.now() - config.supervision.heartbeatSecondes * 1000);

  const [agents, sessions, appelsEnCours, entretiens, appelsAuj, repondantsDisponibles, signalements] =
    await Promise.all([
      db.user.findMany({
        where: { role: "AGENT", active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      db.$queryRaw<{ agentId: string; status: string }[]>`
        SELECT "agentId", "status" FROM "AgentSession"
        WHERE "endedAt" IS NULL
          AND "agentId" IN (SELECT id FROM "User" WHERE role = 'AGENT' AND active = true)
          AND ("lastActivityAt" >= ${limiteHeartbeat} OR "status" = 'EN_PAUSE')
      `,
      db.callAttempt.count({ where: { status: "EN_COURS" } }),
      db.interview.aggregate({
        where: { status: "TERMINE", completedAt: { gte: debutJour } },
        _count: true,
        _avg: { durationSeconds: true },
      }),
      db.callAttempt.groupBy({
        by: ["status", "agentId"],
        where: { startedAt: { gte: debutJour } },
        _count: true,
      }),
      db.respondent.count({ where: { status: "DISPONIBLE" } }),
      db.qualityFlag.count({ where: { status: "A_EXAMINER" } }),
    ]);

  const sessionsParAgent = new Map(sessions.map((s) => [s.agentId, s.status]));

  const signalementsParAgent = await db.qualityFlag.groupBy({
    by: ["agentId"],
    where: { status: "A_EXAMINER" },
    _count: true,
  });
  const flagsParAgent = new Map(signalementsParAgent.map((f) => [f.agentId, f._count]));

  const dureesParAgent = await db.interview.groupBy({
    by: ["agentId"],
    where: { status: "TERMINE", completedAt: { gte: debutJour } },
    _avg: { durationSeconds: true },
    _count: true,
  });
  const durees = new Map(dureesParAgent.map((d) => [d.agentId, d._avg.durationSeconds]));

  const lignesAgents: LigneAgentSupervision[] = agents.map((agent) => {
    const appelsAgent = appelsAuj.filter((a) => a.agentId === agent.id);
    const total = appelsAgent.reduce((acc, a) => acc + a._count, 0);
    const refus = appelsAgent.find((a) => a.status === "REFUS")?._count ?? 0;
    const rappels = appelsAgent.find((a) => a.status === "RAPPEL")?._count ?? 0;
    const entretiensAgent = dureesParAgent.find((d) => d.agentId === agent.id)?._count ?? 0;
    const statut = sessionsParAgent.get(agent.id) ?? "HORS_LIGNE";
    return {
      agentId: agent.id,
      nom: agent.name,
      statut,
      appels: total,
      entretiens: entretiensAgent,
      refus,
      rappels,
      dureeMoyenneSecondes: durees.get(agent.id) ?? null,
      tauxRefus: total > 0 ? refus / total : 0,
      signalements: flagsParAgent.get(agent.id) ?? 0,
    };
  });

  return {
    genereA: new Date().toISOString(),
    agentsConnectes: sessions.length,
    agentsDisponibles: sessions.filter((s) => s.status === "DISPONIBLE").length,
    agentsEnActivite: sessions.filter((s) => s.status === "EN_APPEL" || s.status === "EN_ENTRETIEN").length,
    appelsEnCours,
    entretiensTermines: entretiens._count,
    refus: appelsAuj.filter((a) => a.status === "REFUS").reduce((acc, a) => acc + a._count, 0),
    rappels: appelsAuj.filter((a) => a.status === "RAPPEL").reduce((acc, a) => acc + a._count, 0),
    sansReponse:
      appelsAuj.filter((a) => a.status === "SANS_REPONSE" || a.status === "OCCUPE").reduce((acc, a) => acc + a._count, 0),
    signalementsOuverts: signalements,
    repondantsDisponibles,
    lignesAgents,
  };
}

export interface StatsGestionnaire {
  enquetesTotal: number;
  enquetesPubliees: number;
  versionsPubliees: number;
  repondantsTotal: number;
  repondantsInterroges: number;
  repondantsRestants: number;
  entretiensTotal: number;
  entretiensAujourdHui: number;
  entretiens7Jours: { date: string; total: number }[];
  signalementsOuverts: number;
  dureeMoyenneSecondes: number | null;
  versionActive: { titre: string; versionNumber: number; enqueteId: string } | null;
}

export async function statistiquesGestionnaire(): Promise<StatsGestionnaire> {
  const debutJour = DEBUT_JOUR();
  const ilYA7Jours = new Date(debutJour.getTime() - 6 * 86_400_000);

  const [enquetesTotal, enquetesPubliees, versionsPubliees, repondantsTotal, repondantsInterroges, entretiensTotal, entretiensAujourdHui, parJour, signalements, dureeMoyenne, versionActive] =
    await Promise.all([
      db.survey.count(),
      db.survey.count({ where: { status: "PUBLIEE" } }),
      db.surveyVersion.count({ where: { status: "PUBLIEE" } }),
      db.respondent.count(),
      db.respondent.count({ where: { status: "INTERROGE" } }),
      db.interview.count({ where: { status: "TERMINE" } }),
      db.interview.count({ where: { status: "TERMINE", completedAt: { gte: debutJour } } }),
      db.interview.groupBy({
        by: ["completedAt"],
        where: { status: "TERMINE", completedAt: { gte: ilYA7Jours } },
        _count: true,
      }).then((lignes) => {
        // group on completedAt timestamp → bucket per day
        const parJourMap = new Map<string, number>();
        for (const ligne of lignes) {
          if (!ligne.completedAt) continue;
          const cle = ligne.completedAt.toISOString().slice(0, 10);
          parJourMap.set(cle, (parJourMap.get(cle) ?? 0) + ligne._count);
        }
        return Array.from({ length: 7 }, (_, i) => {
          const d = new Date(ilYA7Jours.getTime() + i * 86_400_000);
          const cle = d.toISOString().slice(0, 10);
          return { date: cle, total: parJourMap.get(cle) ?? 0 };
        });
      }),
      db.qualityFlag.count({ where: { status: "A_EXAMINER" } }),
      db.interview.aggregate({
        where: { status: "TERMINE", durationSeconds: { not: null } },
        _avg: { durationSeconds: true },
      }),
      db.surveyVersion.findFirst({
        where: { status: "PUBLIEE" },
        orderBy: { publishedAt: "desc" },
        include: { survey: { select: { title: true, id: true } } },
      }),
    ]);

  return {
    enquetesTotal,
    enquetesPubliees,
    versionsPubliees,
    repondantsTotal,
    repondantsInterroges,
    repondantsRestants: repondantsTotal - repondantsInterroges,
    entretiensTotal,
    entretiensAujourdHui,
    entretiens7Jours: parJour,
    signalementsOuverts: signalements,
    dureeMoyenneSecondes: dureeMoyenne._avg.durationSeconds ?? null,
    versionActive: versionActive
      ? { titre: versionActive.survey.title, versionNumber: versionActive.versionNumber, enqueteId: versionActive.survey.id }
      : null,
  };
}

/** Interviews list with filters (manager / supervisor view). */
export async function listerEntretiens(filtre: { statut?: string; qualite?: string; page?: number }) {
  const parPage = 25;
  const page = Math.max(1, filtre.page ?? 1);
  const where = {
    ...(filtre.statut && filtre.statut !== "TOUS" ? { status: filtre.statut as never } : {}),
    ...(filtre.qualite && filtre.qualite !== "TOUS" ? { qualityStatus: filtre.qualite as never } : {}),
  };
  const [total, entretiens] = await Promise.all([
    db.interview.count({ where }),
    db.interview.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
      include: {
        agent: { select: { name: true } },
        respondent: { select: { id: true, name: true, externalRef: true } },
        surveyVersion: { select: { versionNumber: true, survey: { select: { title: true } } } },
        _count: { select: { answers: true, qualityFlags: true } },
      },
    }),
  ]);
  return { total, page, parPage, pages: Math.ceil(total / parPage), entretiens };
}
