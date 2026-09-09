import type { QuestionDef, ReponsesParCle } from "@/lib/survey-engine/types";
import { estVisible, questionsVisibles } from "@/lib/survey-engine/visibility";
import { estVide } from "@/lib/survey-engine/types";

/**
 * Progression & navigation inside a live interview.
 * The agent can only navigate between VISIBLE questions; skipped questions
 * (branching) are never counted, so "Question 7 sur 18" always reflects the
 * respondent's actual path.
 */

export function premiereQuestionNonRepondue(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
): QuestionDef | null {
  const visibles = questionsVisibles(questions, reponses);
  for (const q of visibles) {
    if (estVide(reponses[q.key])) return q;
  }
  return visibles.length > 0 ? visibles[visibles.length - 1] : null;
}

export interface EtatProgression {
  index: number; // 1-based index of the current question among visible ones
  total: number;
  repondues: number;
  termine: boolean;
}

export function calculerProgression(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
  cleCourante: string,
): EtatProgression {
  const visibles = questionsVisibles(questions, reponses);
  const total = visibles.length;
  const index = Math.max(1, visibles.findIndex((q) => q.key === cleCourante) + 1);
  const repondues = visibles.filter((q) => !estVide(reponses[q.key])).length;
  return { index, total, repondues, termine: repondues === total && total > 0 };
}

export function questionSuivante(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
  cleCourante: string,
): QuestionDef | null {
  const visibles = questionsVisibles(questions, reponses);
  const i = visibles.findIndex((q) => q.key === cleCourante);
  if (i === -1) return visibles[0] ?? null;
  return visibles[i + 1] ?? null;
}

export function questionPrecedente(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
  cleCourante: string,
): QuestionDef | null {
  const visibles = questionsVisibles(questions, reponses);
  const i = visibles.findIndex((q) => q.key === cleCourante);
  if (i <= 0) return null;
  return visibles[i - 1];
}

/**
 * Is every visible required question answered? (submission gate)
 * Non-visible questions are ignored by design — branching may legitimately
 * leave them empty.
 */
export function questionnaireComplet(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
): { complet: boolean; clesManquantes: string[] } {
  const visibles = questionsVisibles(questions, reponses);
  const clesManquantes = visibles
    .filter((q) => q.required && estVide(reponses[q.key]))
    .map((q) => q.key);
  return { complet: clesManquantes.length === 0, clesManquantes };
}

export function estQuestionVisible(
  question: QuestionDef,
  reponses: ReponsesParCle,
): boolean {
  return estVisible(question, reponses);
}
