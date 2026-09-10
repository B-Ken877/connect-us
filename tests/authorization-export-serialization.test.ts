import { describe, it, expect } from "vitest";
import { accesAutorise, rolesPourChemin, estRoutePublique, ACCUEIL_PAR_ROLE } from "@/lib/auth/permissions";
import { versCsv, construireExportEntretiens, nomFichierExport } from "@/lib/export/csv";
import { versColonnes, depuisColonnes, repondreEnTexte } from "@/lib/survey-engine/serialization";
import { signatureReponses } from "@/lib/survey-engine/coherence";
import type { QuestionDef } from "@/lib/survey-engine/types";

describe("Autorisation — matrice rôles / routes", () => {
  it("l'agent accède à /session mais pas aux espaces de gestion", () => {
    expect(accesAutorise("/session", "AGENT")).toBe(true);
    expect(accesAutorise("/session/appel/xyz", "AGENT")).toBe(true);
    expect(accesAutorise("/enquetes", "AGENT")).toBe(false);
    expect(accesAutorise("/supervision", "AGENT")).toBe(false);
    expect(accesAutorise("/repondants", "AGENT")).toBe(false);
    expect(accesAutorise("/agents", "AGENT")).toBe(false);
  });

  it("l'administrateur a accès partout (appel, gestion, qualité, comptes)", () => {
    for (const chemin of [
      "/session",
      "/tableau-de-bord",
      "/enquetes",
      "/enquetes/nouveau",
      "/repondants",
      "/entretiens",
      "/supervision",
      "/controle-qualite",
      "/agents",
      "/parametres",
    ]) {
      expect(accesAutorise(chemin, "ADMINISTRATEUR")).toBe(true);
    }
  });

  it("correspondance préfixe la plus longue", () => {
    expect(rolesPourChemin("/session/appel/abc")).toContain("AGENT");
  });

  it("pages publiques : connexion et santé seulement", () => {
    expect(estRoutePublique("/connexion")).toBe(true);
    expect(estRoutePublique("/api/sante")).toBe(true);
    expect(estRoutePublique("/tableau-de-bord")).toBe(false);
    expect(estRoutePublique("/session")).toBe(false);
  });

  it("chaque rôle a une page d'accueil", () => {
    expect(ACCUEIL_PAR_ROLE.AGENT).toBe("/session");
    expect(ACCUEIL_PAR_ROLE.ADMINISTRATEUR).toBe("/tableau-de-bord");
  });
});

describe("Export CSV", () => {
  it("échappe les séparateurs, guillemets et retours à la ligne", () => {
    const csv = versCsv({
      entetes: ["Nom", "Commentaire"],
      lignes: [["Dupont", 'Il a dit "non"\nà deux reprises'], ["Martin;Jean", "ok"]],
    });
    const lignes = csv.split("\r\n");
    expect(lignes[0].charCodeAt(0)).toBe(0xfeff); // BOM
    expect(lignes[0].slice(1)).toBe("Nom;Commentaire");
    expect(lignes[1]).toContain('"Il a dit ""non""');
    expect(lignes[2]).toContain('"Martin;Jean"');
  });

  it("inclut un BOM UTF-8 pour Excel", () => {
    expect(versCsv({ entetes: ["a"], lignes: [] }).charCodeAt(0)).toBe(0xfeff);
  });

  it("une colonne par question, dans l'ordre des libellés", () => {
    const question: QuestionDef = {
      id: "1",
      key: "intention",
      text: "Intention de vote (fictif)",
      type: "CHOIX_UNIQUE",
      required: true,
      order: 0,
      options: [
        { id: "o1", label: "Candidat A (fictif)", value: "candidat_a", order: 0 },
        { id: "o2", label: "Candidat B (fictif)", value: "candidat_b", order: 1 },
      ],
    };
    const lignes = construireExportEntretiens({
      questions: [question],
      inclureIdentite: false,
      entretiens: [
        {
          interview: {
            id: "i1",
            startedAt: new Date("2026-01-01T09:00:00Z"),
            completedAt: new Date("2026-01-01T09:10:00Z"),
            durationSeconds: 600,
            status: "TERMINE",
            qualityStatus: "VALIDE",
            agent: { name: "Camille Fournier" },
            respondent: { id: "r1", externalRef: "REF-1" },
          },
          reponses: { intention: { choix: ["candidat_a"] } },
        },
      ],
    });
    expect(lignes.entetes).toContain("Intention de vote (fictif)");
    expect(lignes.entetes).not.toContain("Référence externe"); // PII non demandée
    expect(lignes.lignes[0]).toContain("Candidat A (fictif)");
  });

  it("nom de fichier export sûr", () => {
    const nom = nomFichierExport("Enquête politique — Démonstration", 2);
    expect(nom).toBe("export-enquete-politique-demonstration-v2-" + new Date().toISOString().slice(0, 10) + ".csv");
  });
});

describe("Sérialisation des réponses", () => {
  it("aller-retour colonnes ⇄ valeur pour chaque type", () => {
    const original = { texte: "Bonjour", nombre: 7, date: "2026-06-01", booleen: true, choix: ["a", "b"] };
    const colonnes = versColonnes(original);
    expect(colonnes.textValue).toBe("Bonjour");
    expect(colonnes.numberValue).toBe(7);
    expect(colonnes.dateValue).toBeInstanceOf(Date);
    expect(colonnes.boolValue).toBe(true);
    expect(colonnes.choiceValues).toEqual(["a", "b"]);
    const retour = depuisColonnes(colonnes);
    expect(retour).toEqual(original);
  });

  it("signature de réponses déterministe (détection de répétition)", () => {
    const a = signatureReponses({ emploi: { booleen: true }, intention: { choix: ["candidat_a"] } });
    const b = signatureReponses({ intention: { choix: ["candidat_a"] }, emploi: { booleen: true } });
    expect(a).toBe(b);
    const c = signatureReponses({ emploi: { booleen: false }, intention: { choix: ["candidat_a"] } });
    expect(c).not.toBe(a);
  });

  it("rendu lisible : oui/non et libellés d'options", () => {
    const q: QuestionDef = {
      id: "1",
      key: "inscrit",
      text: "Inscrit ?",
      type: "OUI_NON",
      required: true,
      order: 0,
      options: [],
    };
    expect(repondreEnTexte(q, { booleen: true })).toBe("Oui");
    expect(repondreEnTexte(q, { booleen: false })).toBe("Non");
  });
});
