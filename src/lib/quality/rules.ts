import type { SeveriteSignalement, TypeSignalement } from "@prisma/client";
import type { ConfigurationVersion, ReponsesParCle } from "@/lib/survey-engine/types";
import { evaluerCoherence } from "@/lib/survey-engine/coherence";

/**
 * DATA QUALITY ENGINE — pure rule proposals.
 *
 * Rules receive explicit inputs (computed by quality-service via SQL) and
 * return flag PROPOSALS. Flags never delete or alter data — supervisors
 * review every flag (À examiner / Validé / Rejeté / Faux positif).
 */

export interface PropositionSignalement {
  type: TypeSignalement;
  severite: SeveriteSignalement;
  raison: string;
  metadata?: Record<string, unknown>;
}

export interface SeuilsQualite {
  dureeMinimaleSecondes: number;
  secondesParQuestion: number;
  seuilRepetition: number;
  zScoreActivite: number;
  volumeMinimalActivite: number;
}

// ---------------------------------------------------------------------------
// SPEED FLAG — interview completed significantly faster than plausible
// ---------------------------------------------------------------------------

export function signalerDureeTropCourte(params: {
  dureeSecondes: number | null | undefined;
  nbQuestionsVisibles: number;
  seuils: SeuilsQualite;
}): PropositionSignalement | null {
  const duree = params.dureeSecondes;
  if (!duree || duree <= 0) return null;
  const seuil = Math.max(
    params.seuils.dureeMinimaleSecondes,
    params.nbQuestionsVisibles * params.seuils.secondesParQuestion,
  );
  if (duree >= seuil) return null;
  return {
    type: "DUREE_TROP_COURTE",
    severite: duree < seuil / 2 ? "ELEVEE" : "MOYENNE",
    raison: `Entretien réalisé en ${duree} s pour ${params.nbQuestionsVisibles} question(s) visibles — durée minimale attendue : ${seuil} s.`,
    metadata: { dureeSecondes: duree, seuilSecondes: seuil, nbQuestionsVisibles: params.nbQuestionsVisibles },
  };
}

// ---------------------------------------------------------------------------
// DUPLICATE FLAG — same respondent already has a completed interview
// for the same survey version
// ---------------------------------------------------------------------------

export function signalerDoublon(params: {
  interviewsTerminesMemeRepondant: { id: string; completedAt: Date | null }[];
  interviewCouranteId: string;
}): PropositionSignalement | null {
  const autres = params.interviewsTerminesMemeRepondant.filter((i) => i.id !== params.interviewCouranteId);
  if (autres.length === 0) return null;
  return {
    type: "DOUBLON",
    severite: "ELEVEE",
    raison: `Ce répondant dispose déjà de ${autres.length} entretien(s) terminé(s) pour cette même version d'enquête.`,
    metadata: { interviewsConcurrentes: autres.map((a) => a.id) },
  };
}

// ---------------------------------------------------------------------------
// REPEATED ANSWER PATTERN FLAG — agent submits many identical interviews
// ---------------------------------------------------------------------------

export function signalerRepetitionReponses(params: {
  signaturesHistoriquesAgent: { interviewId: string; signature: string }[];
  interviewCourantId: string;
  signatureCourante: string;
  seuils: SeuilsQualite;
}): PropositionSignalement | null {
  const identiques = params.signaturesHistoriquesAgent.filter(
    (h) => h.interviewId !== params.interviewCourantId && h.signature === params.signatureCourante,
  ).length;
  const total = identiques + 1;
  if (identiques + 1 < params.seuils.seuilRepetition) return null;
  if (!params.signatureCourante) return null;
  return {
    type: "REPETITION_REPONSES",
    severite: total > params.seuils.seuilRepetition + 2 ? "CRITIQUE" : "ELEVEE",
    raison: `Cet agent a soumis ${total} entretiens présentant un profil de réponses identique aux questions fermées.`,
    metadata: { entretiensIdentiques: total, signature: params.signatureCourante.slice(0, 500) },
  };
}

// ---------------------------------------------------------------------------
// EXCESSIVE ACTIVITY FLAG — agent volume statistically unusual vs. the team
// (baseline computed EXCLUDING the agent under review — otherwise a strong
// outlier inflates σ and hides itself on small teams)
// ---------------------------------------------------------------------------

export function signalerActiviteExcessive(params: {
  agentId: string;
  entretiensAgentAujourdHui: number;
  entretiensEquipeAujourdHui: { agentId: string; total: number }[];
  seuils: SeuilsQualite;
}): PropositionSignalement | null {
  const { entretiensAgentAujourdHui, entretiensEquipeAujourdHui, seuils, agentId } = params;
  if (entretiensAgentAujourdHui < seuils.volumeMinimalActivite) return null;

  // Baseline : teammates only (excluding the agent under review).
  const totaux = entretiensEquipeAujourdHui
    .filter((e) => e.agentId !== agentId)
    .map((e) => e.total);
  if (totaux.length < 2) return null; // not enough teammates for a baseline
  const moyenne = totaux.reduce((a, b) => a + b, 0) / totaux.length;
  const variance = totaux.reduce((acc, t) => acc + (t - moyenne) ** 2, 0) / totaux.length;
  const ecartType = Math.sqrt(variance);
  if (ecartType === 0) {
    // Identical volumes everywhere — flag only on gross absolute deviation.
    if (entretiensAgentAujourdHui <= moyenne * 2) return null;
    return {
      type: "ACTIVITE_EXCESSIVE",
      severite: "ELEVEE",
      raison: `Volume d'entretiens anormalement élevé aujourd'hui (${entretiensAgentAujourdHui}) contre une équipe homogène à ${moyenne.toFixed(0)} en moyenne.`,
      metadata: { entretiens: entretiensAgentAujourdHui, moyenne, ecartType, z: null },
    };
  }
  const z = (entretiensAgentAujourdHui - moyenne) / ecartType;
  if (z < seuils.zScoreActivite) return null;

  return {
    type: "ACTIVITE_EXCESSIVE",
    severite: z > seuils.zScoreActivite * 1.5 ? "ELEVEE" : "MOYENNE",
    raison: `Volume d'entretiens anormalement élevé aujourd'hui (${entretiensAgentAujourdHui}) — écart statistique z=${z.toFixed(2)} par rapport à l'équipe (moyenne ${moyenne.toFixed(1)}).`,
    metadata: { entretiens: entretiensAgentAujourdHui, moyenne, ecartType, z },
  };
}

// ---------------------------------------------------------------------------
// INCONSISTENCY FLAG — declarative coherence rules detect contradictions
// ---------------------------------------------------------------------------

export function signalerIncoherence(params: {
  reponses: ReponsesParCle;
  configuration: ConfigurationVersion | null | undefined;
}): PropositionSignalement | null {
  const violations = evaluerCoherence([], params.reponses, params.configuration);
  if (violations.length === 0) return null;
  return {
    type: "INCOHERENCE",
    severite: "MOYENNE",
    raison: `Réponses incohérentes détectées : ${violations.map((v) => v.message).join(" ; ")}`,
    metadata: { violations },
  };
}

// ---------------------------------------------------------------------------
// UNITED Research — Règle #3 : TAUX_REFUS_ELEVE
// L'agent a un taux de refus > seuilRefus sur ses N derniers appels.
// Peut indiquer que l'agent ne suit pas le script, est impoli, ou cible mal.
// ---------------------------------------------------------------------------

export function signalerTauxRefusEleve(params: {
  appelsRecents: { statut: string }[];
  seuilRefusPourcent: number;
  fenetreMinimale: number;
}): PropositionSignalement | null {
  const appels = params.appelsRecents;
  if (appels.length < params.fenetreMinimale) return null;

  const refus = appels.filter((a) => a.statut === "REFUS").length;
  const taux = (refus / appels.length) * 100;
  if (taux < params.seuilRefusPourcent) return null;

  return {
    type: "TAUX_REFUS_ELEVE",
    severite: taux > params.seuilRefusPourcent + 20 ? "ELEVEE" : "MOYENNE",
    raison: `Taux de refus élevé : ${refus}/${appels.length} appels (${taux.toFixed(0)}%) sur les derniers appels — seuil : ${params.seuilRefusPourcent}%.`,
    metadata: { refus, total: appels.length, taux, seuil: params.seuilRefusPourcent },
  };
}

// ---------------------------------------------------------------------------
// UNITED Research — Règle #4 : TAUX_COMPLETION_FAIBLE
// L'agent a un taux de complétion < seuilCompletion sur ses N derniers appels.
// Beaucoup d'appels sans complétion = problème d'efficacité ou technique.
// ---------------------------------------------------------------------------

export function signalerTauxCompletionFaible(params: {
  appelsRecents: { statut: string }[];
  seuilCompletionPourcent: number;
  fenetreMinimale: number;
}): PropositionSignalement | null {
  const appels = params.appelsRecents;
  if (appels.length < params.fenetreMinimale) return null;

  const termines = appels.filter((a) => a.statut === "TERMINE").length;
  const taux = (termines / appels.length) * 100;
  if (taux >= params.seuilCompletionPourcent) return null;

  return {
    type: "TAUX_COMPLETION_FAIBLE",
    severite: taux < params.seuilCompletionPourcent / 2 ? "ELEVEE" : "MOYENNE",
    raison: `Taux de complétion faible : ${termines}/${appels.length} appels terminés (${taux.toFixed(0)}%) — seuil attendu : ${params.seuilCompletionPourcent}%.`,
    metadata: { termines, total: appels.length, taux, seuil: params.seuilCompletionPourcent },
  };
}

// ---------------------------------------------------------------------------
// UNITED Research — Règle #7 : SESSION_SANS_ACTIVITE
// Session agent ouverte > 30 min sans aucun appel terminé.
// L'agent est présent mais ne travaille pas — problème de productivité.
// ---------------------------------------------------------------------------

export function signalerSessionSansActivite(params: {
  dureeSessionMinutes: number;
  appelsTerminesSession: number;
  seuilMinutes: number;
}): PropositionSignalement | null {
  if (params.appelsTerminesSession > 0) return null;
  if (params.dureeSessionMinutes < params.seuilMinutes) return null;

  return {
    type: "SESSION_SANS_ACTIVITE",
    severite: params.dureeSessionMinutes > params.seuilMinutes * 2 ? "MOYENNE" : "FAIBLE",
    raison: `Session ouverte depuis ${params.dureeSessionMinutes} min sans aucun appel terminé — seuil : ${params.seuilMinutes} min.`,
    metadata: { dureeSessionMinutes: params.dureeSessionMinutes, appelsTermines: params.appelsTerminesSession },
  };
}

// ---------------------------------------------------------------------------
// UNITED Research — Règle #8 : DUREE_SUSPECTE_REGULIERE
// Les durées des appels de l'agent sont trop uniformes (variance ≈ 0).
// Les appels humains ont une variance naturelle — trop uniforme = suspect.
// ---------------------------------------------------------------------------

export function signalerDureeSuspecteReguliere(params: {
  dureesAppels: number[];
  fenetreMinimale: number;
  toleranceSecondes: number;
}): PropositionSignalement | null {
  const durees = params.dureesAppels.filter((d) => d > 0);
  if (durees.length < params.fenetreMinimale) return null;

  const moyenne = durees.reduce((a, b) => a + b, 0) / durees.length;
  if (moyenne <= 0) return null;

  const variance = durees.reduce((acc, d) => acc + (d - moyenne) ** 2, 0) / durees.length;
  const ecartType = Math.sqrt(variance);

  // Si l'écart-type est très petit par rapport à la tolérance, les durées sont trop uniformes.
  if (ecartType > params.toleranceSecondes) return null;

  return {
    type: "DUREE_SUSPECTE_REGULIERE",
    severite: ecartType < params.toleranceSecondes / 2 ? "ELEVEE" : "MOYENNE",
    raison: `Durées d'appels anormalement uniformes : écart-type ${ecartType.toFixed(1)}s sur ${durees.length} appels (moyenne ${moyenne.toFixed(0)}s) — variance trop faible pour des appels humains.`,
    metadata: { moyenne, ecartType, nbAppels: durees.length, durees: durees.slice(-10) },
  };
}
