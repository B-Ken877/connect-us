import { describe, it, expect } from "vitest";
import { validerReponse, validerQuestionnaire } from "@/lib/survey-engine/validation";
import type { QuestionDef } from "@/lib/survey-engine/types";

function question(partial: Partial<QuestionDef> & { key: string; type: QuestionDef["type"] }): QuestionDef {
  return {
    id: partial.key,
    text: partial.key,
    required: false,
    order: 0,
    options: partial.options ?? [],
    ...partial,
  } as QuestionDef;
}

describe("Moteur d'enquête — validation", () => {
  it("refuse une question obligatoire vide", () => {
    const q = question({ key: "nom", type: "TEXTE_COURT", required: true });
    expect(validerReponse(q, undefined)).toContain("obligatoire");
    expect(validerReponse(q, { texte: "" })).toContain("obligatoire");
    expect(validerReponse(q, { texte: "Dupont" })).toBeNull();
  });

  it("accepte une question facultative vide", () => {
    const q = question({ key: "commentaire", type: "TEXTE_LONG" });
    expect(validerReponse(q, undefined)).toBeNull();
  });

  it("respecte les bornes numériques (ex. âge)", () => {
    const q = question({ key: "age", type: "NOMBRE", required: true, configuration: { nombreMin: 14, nombreMax: 120, entier: true } });
    expect(validerReponse(q, { nombre: 30 })).toBeNull();
    expect(validerReponse(q, { nombre: 5 })).toContain("supérieure ou égale à 14");
    expect(validerReponse(q, { nombre: 200 })).toContain("inférieure ou égale à 120");
    expect(validerReponse(q, { nombre: 30.5 })).toContain("entier");
    expect(validerReponse(q, {})).toContain("obligatoire");
  });

  it("valide l'échelle 0-10", () => {
    const q = question({ key: "confiance", type: "ECHELLE", configuration: { echelleMin: 0, echelleMax: 10 } });
    expect(validerReponse(q, { nombre: 7 })).toBeNull();
    expect(validerReponse(q, { nombre: 11 })).toContain("entre 0 et 10");
    expect(validerReponse(q, { nombre: -1 })).toContain("entre 0 et 10");
  });

  it("Oui/Non : exige un booléen", () => {
    const q = question({ key: "emploi", type: "OUI_NON", required: true });
    expect(validerReponse(q, { booleen: true })).toBeNull();
    expect(validerReponse(q, {})).toContain("obligatoire");
  });

  it("choix unique : refuse une valeur fabriquée hors options", () => {
    const q = question({
      key: "intention",
      type: "CHOIX_UNIQUE",
      options: [
        { id: "1", label: "A", value: "candidat_a", order: 0 },
        { id: "2", label: "B", value: "candidat_b", order: 1 },
      ],
    });
    expect(validerReponse(q, { choix: ["candidat_a"] })).toBeNull();
    expect(validerReponse(q, { choix: ["pirate"] })).toContain("option valide");
    expect(validerReponse(q, { choix: ["candidat_a", "candidat_b"] })).toContain("une seule");
  });

  it("choix multiple : exige au moins une option et toutes valides", () => {
    const q = question({
      key: "priorites",
      type: "CHOIX_MULTIPLE",
      required: true,
      options: [
        { id: "1", label: "Santé", value: "sante", order: 0 },
        { id: "2", label: "Emploi", value: "emploi", order: 1 },
      ],
    });
    expect(validerReponse(q, { choix: ["sante", "emploi"] })).toBeNull();
    expect(validerReponse(q, { choix: [] })).toContain("obligatoire");
    expect(validerReponse(q, { choix: ["sante", "hack"] })).toContain("option valide");
  });

  it("texte : longueur min/max et regex personnalisée", () => {
    const q = question({
      key: "code_postal",
      type: "TEXTE_COURT",
      configuration: { texteMin: 5, texteMax: 5 },
      validationRules: { motif: "^[0-9]{5}$", message: "Code postal à 5 chiffres requis." },
    });
    expect(validerReponse(q, { texte: "75001" })).toBeNull();
    expect(validerReponse(q, { texte: "7500" })).toContain("au moins 5");
    expect(validerReponse(q, { texte: "abcde" })).toContain("Code postal à 5 chiffres");
  });

  it("date : refuse un format invalide", () => {
    const q = question({ key: "date_dispo", type: "DATE" });
    expect(validerReponse(q, { date: "2026-06-15" })).toBeNull();
    expect(validerReponse(q, { date: "15/06/2026" })).toContain("date valide");
  });

  it("validerQuestionnaire agrège toutes les erreurs visibles", () => {
    const q1 = question({ key: "a", type: "OUI_NON", required: true });
    const q2 = question({ key: "b", type: "NOMBRE", configuration: { nombreMin: 0 } });
    const erreurs = validerQuestionnaire(
      [q1, q2],
      { b: { nombre: -5 } },
      [q1, q2],
    );
    expect(Object.keys(erreurs).sort()).toEqual(["a", "b"]); // a obligatoire vide, b hors borne
  });
});
