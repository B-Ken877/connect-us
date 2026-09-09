/**
 * GIG SURVEY ENGINE — shared domain types.
 *
 * This module is intentionally pure (no Prisma, no React, no next/headers):
 * it is used identically by the survey builder (client), the agent interview
 * UI (client) and the submission services (server) so validation can never
 * drift between build-time preview and runtime execution.
 */

export type TypeQuestion =
  | "TEXTE_COURT"
  | "TEXTE_LONG"
  | "NOMBRE"
  | "OUI_NON"
  | "CHOIX_UNIQUE"
  | "CHOIX_MULTIPLE"
  | "ECHELLE"
  | "DATE"
  | "LISTE_DEROULANTE";

export const LIBELLES_TYPE_QUESTION: Record<TypeQuestion, string> = {
  TEXTE_COURT: "Texte court",
  TEXTE_LONG: "Texte long",
  NOMBRE: "Nombre",
  OUI_NON: "Oui / Non",
  CHOIX_UNIQUE: "Choix unique",
  CHOIX_MULTIPLE: "Choix multiple",
  ECHELLE: "Échelle / notation",
  DATE: "Date",
  LISTE_DEROULANTE: "Liste déroulante",
};

// ---------------------------------------------------------------------------
// Conditional display logic (declarative rule tree)
// ---------------------------------------------------------------------------

export type OperateurCondition =
  | "EGAL"
  | "DIFFERENT"
  | "CONTIENT"
  | "NON_CONTIENT"
  | "SUPERIEUR"
  | "SUPERIEUR_OU_EGAL"
  | "INFERIEUR"
  | "INFERIEUR_OU_EGAL"
  | "EST_REPONDU"
  | "EST_VIDE";

export const LIBELLES_OPERATEUR: Record<OperateurCondition, string> = {
  EGAL: "est égal à",
  DIFFERENT: "est différent de",
  CONTIENT: "contient",
  NON_CONTIENT: "ne contient pas",
  SUPERIEUR: "est supérieur à",
  SUPERIEUR_OU_EGAL: "est supérieur ou égal à",
  INFERIEUR: "est inférieur à",
  INFERIEUR_OU_EGAL: "est inférieur ou égal à",
  EST_REPONDU: "a une réponse",
  EST_VIDE: "n'a pas de réponse",
};

export interface ConditionAffichage {
  /** Stable key of the (earlier) question this condition refers to. */
  questionKey: string;
  operateur: OperateurCondition;
  /** Comparison value (not needed for EST_REPONDU / EST_VIDE). */
  valeur?: string | number | boolean;
}

export interface LogiqueConditionnelle {
  /** How conditions combine. */
  operateurLogique: "ET" | "OU";
  conditions: ConditionAffichage[];
}

// ---------------------------------------------------------------------------
// Question definition (builder ⇄ runtime)
// ---------------------------------------------------------------------------

export interface OptionQuestionDef {
  id: string;
  label: string;
  value: string;
  order: number;
}

export interface ConfigurationQuestion {
  /** TEXTE_* */
  texteMin?: number;
  texteMax?: number;
  placeholder?: string;
  /** NOMBRE */
  nombreMin?: number;
  nombreMax?: number;
  entier?: boolean;
  unite?: string;
  /** ECHELLE */
  echelleMin?: number;
  echelleMax?: number;
  echelleMinLibelle?: string;
  echelleMaxLibelle?: string;
  /** DATE (ISO strings) */
  dateMin?: string;
  dateMax?: string;
}

export interface RegleValidation {
  /** Regular expression the text answer must match. */
  motif?: string;
  /** Custom French error message used when the rule fails. */
  message?: string;
}

export interface QuestionDef {
  id: string;
  key: string;
  text: string;
  helpText?: string | null;
  type: TypeQuestion;
  required: boolean;
  order: number;
  configuration?: ConfigurationQuestion | null;
  validationRules?: RegleValidation | null;
  conditionalLogic?: LogiqueConditionnelle | null;
  options: OptionQuestionDef[];
}

// ---------------------------------------------------------------------------
// Answers — canonical client/runtime representation
// ---------------------------------------------------------------------------

export interface ValeurReponse {
  texte?: string;
  nombre?: number;
  date?: string; // ISO (yyyy-mm-dd)
  booleen?: boolean;
  choix?: string[]; // option values (single choice ⇒ exactly one)
}

export type ReponsesParCle = Record<string, ValeurReponse>;

/** Serialized DB column representation (Answer model). */
export interface ColonnesReponse {
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: Date | null;
  boolValue?: boolean | null;
  choiceValues?: string[];
}

export function estVide(valeur: ValeurReponse | undefined | null): boolean {
  if (!valeur) return true;
  const texteVide =
    valeur.texte === undefined || valeur.texte === null || valeur.texte.trim() === "";
  const nombreVide =
    valeur.nombre === undefined || valeur.nombre === null || Number.isNaN(valeur.nombre);
  const dateVide = !valeur.date;
  const boolVide = valeur.booleen === undefined || valeur.booleen === null;
  const choixVide = !valeur.choix || valeur.choix.length === 0;
  return texteVide && nombreVide && dateVide && boolVide && choixVide;
}

// ---------------------------------------------------------------------------
// Survey version runtime configuration
// ---------------------------------------------------------------------------

export interface RegleCoherence {
  id: string;
  message: string;
  si: ConditionAffichage;
  alorsIncompatibleAvec: ConditionAffichage;
}

export interface ConfigurationVersion {
  /** Expected interview duration in seconds (quality baseline). */
  dureeAttendueSecondes?: number;
  /** Declarative logical-incompatibility rules (INCOHERENCE flags). */
  reglesCoherence?: RegleCoherence[];
}
