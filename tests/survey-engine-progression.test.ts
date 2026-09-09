import { describe, it, expect } from "vitest";
import {
  questionnaireComplet,
  calculerProgression,
  questionSuivante,
  questionPrecedente,
} from "@/lib/survey-engine/progression";
import type { QuestionDef, ReponsesParCle } from "@/lib/survey-engine/types";

function construire(): QuestionDef[] {
  return [
    { id: "1", key: "age", text: "Âge ?", type: "NOMBRE", required: true, order: 0, options: [] },
    { id: "2", key: "emploi", text: "Travaillez-vous ?", type: "OUI_NON", required: true, order: 1, options: [] },
    {
      id: "3",
      key: "secteur",
      text: "Secteur ?",
      type: "CHOIX_UNIQUE",
      required: true,
      order: 2,
      options: [
        { id: "o1", label: "Public", value: "public", order: 0 },
        { id: "o2", label: "Privé", value: "prive", order: 1 },
      ],
      conditionalLogic: { operateurLogique: "ET", conditions: [{ questionKey: "emploi", operateur: "EGAL", valeur: "oui" }] },
    },
    {
      id: "4",
      key: "fin",
      text: "Commentaire ?",
      type: "TEXTE_COURT",
      required: false,
      order: 3,
      options: [],
    },
  ];
}

describe("Moteur d'enquête — progression & complétude", () => {
  it("ne compte pas les questions non visibles dans le total", () => {
    const questions = construire();
    const reponses: ReponsesParCle = { age: { nombre: 40 }, emploi: { booleen: false } };
    const progression = calculerProgression(questions, reponses, "fin");
    expect(progression.total).toBe(3); // secteur sauté par la logique
    expect(progression.index).toBe(3);
  });

  it("questionnaireComplet ignore les questions invisibles", () => {
    const questions = construire();
    // secteur (obligatoire) invisible car emploi = non → complet sans y répondre
    const reponses: ReponsesParCle = { age: { nombre: 40 }, emploi: { booleen: false } };
    const etat = questionnaireComplet(questions, reponses);
    expect(etat.complet).toBe(true);

    // emploi = oui → secteur devient visible et obligatoire → incomplet
    const reponses2: ReponsesParCle = { age: { nombre: 40 }, emploi: { booleen: true } };
    expect(questionnaireComplet(questions, reponses2).complet).toBe(false);
    expect(questionnaireComplet(questions, reponses2).clesManquantes).toEqual(["secteur"]);
  });

  it("navigation : saute les questions non visibles", () => {
    const questions = construire();
    const reponses: ReponsesParCle = { age: { nombre: 40 }, emploi: { booleen: false } };
    expect(questionSuivante(questions, reponses, "emploi")?.key).toBe("fin");
    expect(questionPrecedente(questions, reponses, "fin")?.key).toBe("emploi");
  });

  it("navigation : inclut les questions redevenues visibles", () => {
    const questions = construire();
    const reponses: ReponsesParCle = { age: { nombre: 40 }, emploi: { booleen: true } };
    expect(questionSuivante(questions, reponses, "emploi")?.key).toBe("secteur");
  });

  it("retourne null en fin de questionnaire", () => {
    const questions = construire();
    const reponses: ReponsesParCle = { emploi: { booleen: false } };
    expect(questionSuivante(questions, reponses, "fin")).toBeNull();
  });
});
