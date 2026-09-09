import type {
  ConditionAffichage,
  QuestionDef,
  ReponsesParCle,
  ValeurReponse,
} from "@/lib/survey-engine/types";
import { estVide } from "@/lib/survey-engine/types";

/**
 * Conditional visibility evaluation.
 *
 * Rules reference ONLY earlier questions (by stable key); the evaluation is
 * data-driven (against the current answer map), which makes deep branching
 * and chains of conditions safe without recursive evaluation.
 */

function valeurCompare(condition: ConditionAffichage, reponse: ValeurReponse | undefined):
  | { present: true; texte: string; nombre: number; booleen: boolean; choix: string[] }
  | { present: false } {
  if (!reponse || estVide(reponse)) return { present: false };
  const choix = reponse.choix ?? [];
  return {
    present: true,
    texte: reponse.texte ?? (reponse.booleen !== undefined ? String(reponse.booleen) : choix.join(", ")),
    nombre: reponse.nombre ?? Number.NaN,
    booleen: reponse.booleen ?? false,
    choix,
  };
}

export function evaluerCondition(
  condition: ConditionAffichage,
  reponses: ReponsesParCle,
): boolean {
  const reponse = reponses[condition.questionKey];
  const contexte = valeurCompare(condition, reponse);

  switch (condition.operateur) {
    case "EST_VIDE":
      return !contexte.present;
    case "EST_REPONDU":
      return contexte.present;
    default:
      break;
  }

  if (!contexte.present) return false;

  const attendu = condition.valeur;
  switch (condition.operateur) {
    case "EGAL": {
      if (typeof attendu === "number") return contexte.nombre === attendu;
      if (typeof attendu === "boolean") return contexte.booleen === attendu;
      // Oui/Non answers are stored as booleans — accept "oui"/"non" literals.
      const attenduNormalise = String(attendu).trim().toLowerCase();
      if (attenduNormalise === "oui") return contexte.booleen === true;
      if (attenduNormalise === "non") return contexte.booleen === false;
      if (contexte.choix.length === 1) return contexte.choix[0] === String(attendu);
      return contexte.texte === String(attendu);
    }
    case "DIFFERENT": {
      if (typeof attendu === "number") return contexte.nombre !== attendu;
      if (typeof attendu === "boolean") return contexte.booleen !== attendu;
      const attenduNormalise = String(attendu).trim().toLowerCase();
      if (attenduNormalise === "oui") return contexte.booleen !== true;
      if (attenduNormalise === "non") return contexte.booleen !== false;
      if (contexte.choix.length === 1) return contexte.choix[0] !== String(attendu);
      return contexte.texte !== String(attendu);
    }
    case "CONTIENT":
      return contexte.choix.includes(String(attendu)) || contexte.texte.includes(String(attendu));
    case "NON_CONTIENT":
      return !(contexte.choix.includes(String(attendu)) || contexte.texte.includes(String(attendu)));
    case "SUPERIEUR":
      return contexte.nombre > Number(attendu);
    case "SUPERIEUR_OU_EGAL":
      return contexte.nombre >= Number(attendu);
    case "INFERIEUR":
      return contexte.nombre < Number(attendu);
    case "INFERIEUR_OU_EGAL":
      return contexte.nombre <= Number(attendu);
    default:
      return false;
  }
}

/** Is this question currently visible given the respondent's answers? */
export function estVisible(question: QuestionDef, reponses: ReponsesParCle): boolean {
  const logique = question.conditionalLogic;
  if (!logique || !logique.conditions || logique.conditions.length === 0) return true;

  const resultats = logique.conditions.map((c) => evaluerCondition(c, reponses));
  return logique.operateurLogique === "OU" ? resultats.some(Boolean) : resultats.every(Boolean);
}

/** Ordered list of visible questions. */
export function questionsVisibles(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
): QuestionDef[] {
  return [...questions]
    .sort((a, b) => a.order - b.order)
    .filter((q) => estVisible(q, reponses));
}
