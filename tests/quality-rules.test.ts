import { describe, it, expect } from "vitest";
import {
  signalerDureeTropCourte,
  signalerDoublon,
  signalerRepetitionReponses,
  signalerActiviteExcessive,
  signalerIncoherence,
  type SeuilsQualite,
} from "@/lib/quality/rules";

const SEUILS: SeuilsQualite = {
  dureeMinimaleSecondes: 90,
  secondesParQuestion: 6,
  seuilRepetition: 4,
  zScoreActivite: 2.5,
  volumeMinimalActivite: 12,
};

describe("Moteur qualité", () => {
  describe("DUREE_TROP_COURTE", () => {
    it("ne signale pas un entretien plausible", () => {
      const r = signalerDureeTropCourte({ dureeSecondes: 600, nbQuestionsVisibles: 10, seuils: SEUILS });
      expect(r).toBeNull();
    });

    it("signale un entretien trop rapide (sévérié accrue si moitié du seuil)", () => {
      const moyen = signalerDureeTropCourte({ dureeSecondes: 70, nbQuestionsVisibles: 10, seuils: SEUILS });
      expect(moyen?.type).toBe("DUREE_TROP_COURTE");
      expect(moyen?.severite).toBe("MOYENNE");

      const extreme = signalerDureeTropCourte({ dureeSecondes: 20, nbQuestionsVisibles: 10, seuils: SEUILS });
      expect(extreme?.severite).toBe("ELEVEE");
    });

    it("ignore une durée absente", () => {
      expect(signalerDureeTropCourte({ dureeSecondes: null, nbQuestionsVisibles: 10, seuils: SEUILS })).toBeNull();
    });
  });

  describe("DOUBLON", () => {
    it("signale un répondant déjà interrogé sur la même version", () => {
      const r = signalerDoublon({
        interviewsTerminesMemeRepondant: [
          { id: "autre-1", completedAt: new Date() },
          { id: "autre-2", completedAt: new Date() },
        ],
        interviewCouranteId: "courante",
      });
      expect(r?.type).toBe("DOUBLON");
      expect(r?.severite).toBe("ELEVEE");
    });

    it("rien à signaler si l'entretien est unique", () => {
      expect(signalerDoublon({ interviewsTerminesMemeRepondant: [{ id: "courante", completedAt: new Date() }], interviewCouranteId: "courante" })).toBeNull();
    });
  });

  describe("REPETITION_REPONSES", () => {
    it("ne déclenche pas sous le seuil", () => {
      const historique = [
        { interviewId: "i1", signature: "S" },
        { interviewId: "i2", signature: "S" },
      ];
      const r = signalerRepetitionReponses({
        signaturesHistoriquesAgent: historique,
        interviewCourantId: "courant",
        signatureCourante: "S",
        seuils: SEUILS,
      });
      // identiques = 2 → total = 3 < seuil (4) → pas de signalement
      expect(r).toBeNull();
    });
  });

  it("REPETITION_REPONSES déclenche à partir du seuil", () => {
    const historique = [
      { interviewId: "i1", signature: "S" },
      { interviewId: "i2", signature: "S" },
      { interviewId: "i3", signature: "S" },
    ];
    const r = signalerRepetitionReponses({
      signaturesHistoriquesAgent: historique,
      interviewCourantId: "courant",
      signatureCourante: "S",
      seuils: SEUILS,
    });
    expect(r?.type).toBe("REPETITION_REPONSES");
  });

  it("REPETITION_REPONSES ignore les signatures vides (aucune question fermée)", () => {
    const r = signalerRepetitionReponses({
      signaturesHistoriquesAgent: [
        { interviewId: "i1", signature: "" },
        { interviewId: "i2", signature: "" },
        { interviewId: "i3", signature: "" },
      ],
      interviewCourantId: "courant",
      signatureCourante: "",
      seuils: SEUILS,
    });
    expect(r).toBeNull();
  });

  describe("ACTIVITE_EXCESSIVE", () => {
    const equipe = [
      { agentId: "a1", total: 20 },
      { agentId: "a2", total: 22 },
      { agentId: "a3", total: 18 },
      { agentId: "suspect", total: 60 },
    ];

    it("détecte un volume statistiquement anormal (référence = le reste de l'équipe)", () => {
      const r = signalerActiviteExcessive({
        agentId: "suspect",
        entretiensAgentAujourdHui: 60,
        entretiensEquipeAujourdHui: equipe,
        seuils: SEUILS,
      });
      expect(r?.type).toBe("ACTIVITE_EXCESSIVE");
    });

    it("ne signale pas un volume dans la norme", () => {
      const r = signalerActiviteExcessive({
        agentId: "a2",
        entretiensAgentAujourdHui: 22,
        entretiensEquipeAujourdHui: equipe,
        seuils: SEUILS,
      });
      expect(r).toBeNull();
    });

    it("ne s'applique pas sous le volume minimal", () => {
      const r = signalerActiviteExcessive({
        agentId: "suspect",
        entretiensAgentAujourdHui: 5,
        entretiensEquipeAujourdHui: equipe,
        seuils: SEUILS,
      });
      expect(r).toBeNull();
    });

    it("ne s'applique pas sans coéquipiers de référence", () => {
      const r = signalerActiviteExcessive({
        agentId: "a",
        entretiensAgentAujourdHui: 60,
        entretiensEquipeAujourdHui: [{ agentId: "a", total: 60 }],
        seuils: SEUILS,
      });
      expect(r).toBeNull();
    });
  });

  describe("INCOHERENCE", () => {
    it("détecte une incompatibilité déclarée (âge / emploi)", () => {
      const r = signalerIncoherence({
        reponses: { age: { nombre: 15 }, emploi: { booleen: true } },
        configuration: {
          reglesCoherence: [
            {
              id: "age_emploi",
              message: "Âge inférieur à 16 ans mais déclare occuper un emploi.",
              si: { questionKey: "age", operateur: "INFERIEUR", valeur: 16 },
              alorsIncompatibleAvec: { questionKey: "emploi", operateur: "EGAL", valeur: "oui" },
            },
          ],
        },
      });
      expect(r?.type).toBe("INCOHERENCE");
      expect(r?.raison).toContain("emploi");
    });

    it("pas de violation si les réponses sont cohérentes", () => {
      const r = signalerIncoherence({
        reponses: { age: { nombre: 40 }, emploi: { booleen: true } },
        configuration: {
          reglesCoherence: [
            {
              id: "age_emploi",
              message: "Incohérence",
              si: { questionKey: "age", operateur: "INFERIEUR", valeur: 16 },
              alorsIncompatibleAvec: { questionKey: "emploi", operateur: "EGAL", valeur: "oui" },
            },
          ],
        },
      });
      expect(r).toBeNull();
    });
  });
});
