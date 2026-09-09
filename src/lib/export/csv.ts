import type { QuestionDef, ReponsesParCle } from "@/lib/survey-engine/types";
import { repondreEnTexte } from "@/lib/survey-engine/serialization";

/**
 * CSV export layer (RFC 4180, Excel-compatible BOM).
 * Designed so an XLSX writer can implement the same `LignesExport` contract
 * later without touching services.
 */

export interface LignesExport {
  entetes: string[];
  lignes: (string | number | null)[][];
}

const SEPARATEUR = ";"; // French Excel default

function echampCellule(valeur: string | number | null | undefined): string {
  const s = valeur === null || valeur === undefined ? "" : String(valeur);
  if (/[;"\r\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function versCsv(lignes: LignesExport): string {
  const sortie: string[] = [];
  sortie.push(lignes.entetes.map(echampCellule).join(SEPARATEUR));
  for (const ligne of lignes.lignes) {
    sortie.push(ligne.map(echampCellule).join(SEPARATEUR));
  }
  // \r\n per RFC 4180 + BOM so Excel opens accents correctly
  return "\uFEFF" + sortie.join("\r\n") + "\r\n";
}

export interface DonneesEntretienExport {
  interview: {
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    durationSeconds: number | null;
    status: string;
    qualityStatus: string;
    agent: { name: string };
    respondent: { id: string; externalRef: string | null };
  };
  reponses: ReponsesParCle;
}

export function construireExportEntretiens(params: {
  questions: QuestionDef[];
  entretiens: DonneesEntretienExport[];
  inclureIdentite: boolean;
}): LignesExport {
  const entetes = [
    "Identifiant entretien",
    "Identifiant répondant",
    ...(params.inclureIdentite ? ["Référence externe"] : []),
    "Agent",
    "Date de début",
    "Date de fin",
    "Durée (s)",
    "Statut",
    "Statut qualité",
    ...params.questions.map((q) => q.text),
  ];

  const lignes = params.entretiens.map((e) => {
    const cellules: (string | number | null)[] = [
      e.interview.id,
      e.interview.respondent.id,
      ...(params.inclureIdentite ? [e.interview.respondent.externalRef ?? ""] : []),
      e.interview.agent.name,
      e.interview.startedAt.toISOString(),
      e.interview.completedAt ? e.interview.completedAt.toISOString() : "",
      e.interview.durationSeconds,
      e.interview.status,
      e.interview.qualityStatus,
    ];
    for (const q of params.questions) {
      cellules.push(repondreEnTexte(q, e.reponses[q.key]) || null);
    }
    return cellules;
  });

  return { entetes, lignes };
}

export function nomFichierExport(titreEnquete: string, version: number): string {
  const slug = titreEnquete
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `export-${slug}-v${version}-${date}.csv`;
}
