import type {
  ColonnesReponse,
  QuestionDef,
  ReponsesParCle,
  ValeurReponse,
} from "@/lib/survey-engine/types";
import { estVide } from "@/lib/survey-engine/types";

/**
 * Serialization between the canonical runtime answer shape (ValeurReponse)
 * and the typed, queryable Answer columns (textValue / numberValue / dateValue
 * / boolValue / choiceValues). Answers are NEVER stored as one JSON blob —
 * every column is indexable for analytics.
 */

export function versColonnes(valeur: ValeurReponse): ColonnesReponse {
  const colonnes: ColonnesReponse = {};
  if (valeur.texte !== undefined && valeur.texte !== null && valeur.texte !== "") {
    colonnes.textValue = valeur.texte.trim();
  }
  if (valeur.nombre !== undefined && valeur.nombre !== null && !Number.isNaN(valeur.nombre)) {
    colonnes.numberValue = valeur.nombre;
  }
  if (valeur.date) {
    const d = new Date(`${valeur.date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) colonnes.dateValue = d;
  }
  if (valeur.booleen !== undefined && valeur.booleen !== null) {
    colonnes.boolValue = valeur.booleen;
  }
  if (valeur.choix && valeur.choix.length > 0) {
    colonnes.choiceValues = [...valeur.choix];
  }
  return colonnes;
}

export function depuisColonnes(colonnes: {
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: Date | null;
  boolValue?: boolean | null;
  choiceValues?: string[];
}): ValeurReponse {
  const valeur: ValeurReponse = {};
  if (colonnes.textValue) valeur.texte = colonnes.textValue;
  if (colonnes.numberValue !== null && colonnes.numberValue !== undefined) {
    valeur.nombre = colonnes.numberValue;
  }
  if (colonnes.dateValue) {
    valeur.date = colonnes.dateValue.toISOString().slice(0, 10);
  }
  if (colonnes.boolValue !== null && colonnes.boolValue !== undefined) {
    valeur.booleen = colonnes.boolValue;
  }
  if (colonnes.choiceValues && colonnes.choiceValues.length > 0) {
    valeur.choix = [...colonnes.choiceValues];
  }
  return valeur;
}

/** Human-readable French rendering of an answer (lists, exports, review). */
export function repondreEnTexte(question: QuestionDef, valeur: ValeurReponse | undefined): string {
  if (estVide(valeur)) return "";
  const v = valeur as ValeurReponse;
  switch (question.type) {
    case "OUI_NON":
      return v.booleen ? "Oui" : "Non";
    case "CHOIX_UNIQUE":
    case "CHOIX_MULTIPLE":
    case "LISTE_DEROULANTE": {
      const labels = (v.choix ?? []).map(
        (val) => question.options.find((o) => o.value === val)?.label ?? val,
      );
      return labels.join(" | ");
    }
    case "ECHELLE":
      return `${v.nombre}/10`;
    case "DATE":
      return v.date ?? "";
    case "NOMBRE":
      return `${v.nombre}${question.configuration?.unite ?? ""}`;
    default:
      return v.texte ?? "";
  }
}

/** Normalizes a client-supplied answer against the question type (server input sanitizer). */
export function normaliserValeur(question: QuestionDef, brute: unknown): ValeurReponse {
  const valeur: ValeurReponse = {};
  const b = (brute ?? {}) as Record<string, unknown>;
  switch (question.type) {
    case "TEXTE_COURT":
    case "TEXTE_LONG":
      if (typeof b.texte === "string") valeur.texte = b.texte.slice(0, 5000);
      break;
    case "NOMBRE":
    case "ECHELLE": {
      const n = typeof b.nombre === "string" ? Number(b.nombre.replace(",", ".")) : b.nombre;
      if (typeof n === "number" && Number.isFinite(n)) valeur.nombre = n;
      break;
    }
    case "DATE":
      if (typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) valeur.date = b.date;
      break;
    case "OUI_NON":
      if (typeof b.booleen === "boolean") valeur.booleen = b.booleen;
      else if (b.booleen === "true") valeur.booleen = true;
      else if (b.booleen === "false") valeur.booleen = false;
      break;
    case "CHOIX_UNIQUE":
    case "CHOIX_MULTIPLE":
    case "LISTE_DEROULANTE": {
      const brut = b.choix;
      if (typeof brut === "string") valeur.choix = [brut];
      else if (Array.isArray(brut)) valeur.choix = brut.filter((x): x is string => typeof x === "string");
      break;
    }
  }
  return valeur;
}
