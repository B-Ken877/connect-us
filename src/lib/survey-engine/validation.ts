import type { QuestionDef, ReponsesParCle, ValeurReponse } from "@/lib/survey-engine/types";
import { estVide } from "@/lib/survey-engine/types";

/**
 * Answer validation — the SAME rules run in the builder preview, the agent
 * interview UI and the server-side submission service.
 * Returns null when valid, or a user-facing French error message.
 */

export function validerReponse(question: QuestionDef, valeur: ValeurReponse | undefined): string | null {
  if (estVide(valeur)) {
    return question.required ? "Cette question est obligatoire." : null;
  }
  const v = valeur as ValeurReponse;

  switch (question.type) {
    case "TEXTE_COURT":
    case "TEXTE_LONG":
      return validerTexte(question, v.texte ?? "");
    case "NOMBRE":
      return validerNombre(question, v.nombre);
    case "OUI_NON":
      return typeof v.booleen === "boolean" ? null : "Veuillez répondre par oui ou par non.";
    case "CHOIX_UNIQUE":
    case "LISTE_DEROULANTE":
      return validerChoixUnique(question, v.choix);
    case "CHOIX_MULTIPLE":
      return validerChoixMultiple(question, v.choix);
    case "ECHELLE":
      return validerEchelle(question, v.nombre);
    case "DATE":
      return validerDate(question, v.date);
    default:
      return "Type de question non pris en charge.";
  }
}

function validerTexte(question: QuestionDef, texte: string): string | null {
  const cfg = question.configuration ?? {};
  const min = cfg.texteMin ?? 0;
  const max = cfg.texteMax ?? (question.type === "TEXTE_LONG" ? 5000 : 500);
  const coupe = texte.trim();
  if (coupe.length < min) return `Veuillez saisir au moins ${min} caractère(s).`;
  if (coupe.length > max) return `La réponse ne doit pas dépasser ${max} caractères.`;
  const motif = question.validationRules?.motif;
  if (motif) {
    let regex: RegExp;
    try {
      regex = new RegExp(motif);
    } catch {
      return null; // never crash on an invalid stored pattern
    }
    if (!regex.test(coupe)) {
      return question.validationRules?.message ?? "Le format de la réponse n'est pas valide.";
    }
  }
  return null;
}

function validerNombre(question: QuestionDef, nombre: number | undefined): string | null {
  if (nombre === undefined || nombre === null || Number.isNaN(nombre)) {
    return "Veuillez saisir un nombre valide.";
  }
  const cfg = question.configuration ?? {};
  if (cfg.nombreMin !== undefined && nombre < cfg.nombreMin) {
    return `La valeur doit être supérieure ou égale à ${cfg.nombreMin}${cfg.unite ?? ""}.`;
  }
  if (cfg.nombreMax !== undefined && nombre > cfg.nombreMax) {
    return `La valeur doit être inférieure ou égale à ${cfg.nombreMax}${cfg.unite ?? ""}.`;
  }
  if (cfg.entier && !Number.isInteger(nombre)) return "Veuillez saisir un nombre entier.";
  return null;
}

function validerChoixUnique(question: QuestionDef, choix: string[] | undefined): string | null {
  if (!choix || choix.length !== 1) return "Veuillez sélectionner une seule réponse.";
  const valeursAutorisees = new Set(question.options.map((o) => o.value));
  if (!valeursAutorisees.has(choix[0])) return "La réponse sélectionnée n'est pas une option valide.";
  return null;
}

function validerChoixMultiple(question: QuestionDef, choix: string[] | undefined): string | null {
  if (!choix || choix.length === 0) return "Veuillez sélectionner au moins une réponse.";
  const valeursAutorisees = new Set(question.options.map((o) => o.value));
  if (choix.some((c) => !valeursAutorisees.has(c))) {
    return "Une des réponses sélectionnées n'est pas une option valide.";
  }
  return null;
}

function validerEchelle(question: QuestionDef, nombre: number | undefined): string | null {
  if (nombre === undefined || nombre === null || Number.isNaN(nombre)) {
    return "Veuillez sélectionner une note.";
  }
  const cfg = question.configuration ?? {};
  const min = cfg.echelleMin ?? 0;
  const max = cfg.echelleMax ?? 10;
  if (!Number.isInteger(nombre)) return "La note doit être un nombre entier.";
  if (nombre < min || nombre > max) return `La note doit être comprise entre ${min} et ${max}.`;
  return null;
}

function validerDate(question: QuestionDef, date: string | undefined): string | null {
  if (!date) return "Veuillez saisir une date valide.";
  const parsee = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsee.getTime())) return "Veuillez saisir une date valide (jj/mm/aaaa).";
  const cfg = question.configuration ?? {};
  if (cfg.dateMin && parsee < new Date(`${cfg.dateMin}T00:00:00`)) {
    return `La date doit être postérieure au ${cfg.dateMin}.`;
  }
  if (cfg.dateMax && parsee > new Date(`${cfg.dateMax}T00:00:00`)) {
    return `La date doit être antérieure au ${cfg.dateMax}.`;
  }
  return null;
}

/**
 * Validates the ENTIRE visible questionnaire:
 * returns a map questionKey → error message for every invalid visible answer.
 */
export function validerQuestionnaire(
  questions: QuestionDef[],
  reponses: ReponsesParCle,
  visibles: QuestionDef[],
): Record<string, string> {
  const erreurs: Record<string, string> = {};
  for (const question of visibles) {
    const erreur = validerReponse(question, reponses[question.key]);
    if (erreur) erreurs[question.key] = erreur;
  }
  return erreurs;
}
