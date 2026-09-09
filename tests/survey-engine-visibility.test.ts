import { describe, it, expect } from "vitest";
import { estVisible, questionsVisibles, evaluerCondition } from "@/lib/survey-engine/visibility";
import type { QuestionDef, ReponsesParCle } from "@/lib/survey-engine/types";

function q(partial: Partial<QuestionDef> & { key: string }): QuestionDef {
  return {
    id: partial.key,
    text: `Question ${partial.key}`,
    type: "OUI_NON",
    required: false,
    order: partial.order ?? 0,
    options: [],
    ...partial,
  } as QuestionDef;
}

const EMPLOI = q({ key: "emploi", order: 1 });
const AGE = q({ key: "age", order: 0, type: "NOMBRE" });

describe("Moteur d'enquête — visibilité conditionnelle", () => {
  it("affiche les questions sans logique conditionnelle", () => {
    expect(estVisible(EMPLOI, {})).toBe(true);
  });

  it("branche ET : toutes les conditions doivent être vraies", () => {
    const question = q({
      key: "secteur",
      conditionalLogic: {
        operateurLogique: "ET",
        conditions: [
          { questionKey: "emploi", operateur: "EGAL", valeur: "oui" },
          { questionKey: "age", operateur: "SUPERIEUR_OU_EGAL", valeur: 18 },
        ],
      },
    });
    const ouiEtMajeur: ReponsesParCle = { emploi: { booleen: true }, age: { nombre: 25 } };
    const ouiEtMineur: ReponsesParCle = { emploi: { booleen: true }, age: { nombre: 15 } };
    const nonEmploye: ReponsesParCle = { emploi: { booleen: false }, age: { nombre: 40 } };

    expect(estVisible(question, ouiEtMajeur)).toBe(true);
    expect(estVisible(question, ouiEtMineur)).toBe(false);
    expect(estVisible(question, nonEmploye)).toBe(false);
  });

  it("branche OU : au moins une condition suffit", () => {
    const question = q({
      key: "retraite",
      conditionalLogic: {
        operateurLogique: "OU",
        conditions: [
          { questionKey: "age", operateur: "SUPERIEUR_OU_EGAL", valeur: 65 },
          { questionKey: "emploi", operateur: "EGAL", valeur: "non" },
        ],
      },
    });
    expect(estVisible(question, { age: { nombre: 70 } })).toBe(true);
    expect(estVisible(question, { emploi: { booleen: false } })).toBe(true);
    expect(estVisible(question, { age: { nombre: 30 }, emploi: { booleen: true } })).toBe(false);
  });

  it("EST_VIDE / EST_REPONDU fonctionnent sur réponses absentes", () => {
    const question = q({
      key: "relance",
      conditionalLogic: {
        operateurLogique: "ET",
        conditions: [{ questionKey: "commentaire", operateur: "EST_VIDE" }],
      },
    });
    expect(estVisible(question, {})).toBe(true);
    expect(estVisible(question, { commentaire: { texte: "RAS" } })).toBe(false);
  });

  it("EST_REPONDU détecte une réponse présente", () => {
    const condition = { questionKey: "inscrit", operateur: "EST_REPONDU" as const };
    expect(evaluerCondition(condition, { inscrit: { booleen: true } })).toBe(true);
    expect(evaluerCondition(condition, {})).toBe(false);
  });

  it("CONTIENT fonctionne pour les choix multiples", () => {
    const condition = { questionKey: "priorites", operateur: "CONTIENT" as const, valeur: "sante" };
    expect(evaluerCondition(condition, { priorites: { choix: ["pouvoir_achat", "sante"] } })).toBe(true);
    expect(evaluerCondition(condition, { priorites: { choix: ["securite"] } })).toBe(false);
  });

  it("les questions invisibles sont exclues du chemin (tri par ordre)", () => {
    const questions = [
      q({ key: "emploi", order: 2 }),
      q({ key: "age", order: 1 }),
      q({
        key: "secteur",
        order: 3,
        conditionalLogic: { operateurLogique: "ET", conditions: [{ questionKey: "emploi", operateur: "EGAL", valeur: "oui" }] },
      }),
    ];
    const reponses: ReponsesParCle = { emploi: { booleen: false }, age: { nombre: 44 } };
    const visibles = questionsVisibles(questions, reponses);
    expect(visibles.map((v) => v.key)).toEqual(["age", "emploi"]);
  });
});
