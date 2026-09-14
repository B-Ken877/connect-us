import { exigerAcces } from "@/lib/auth/session";
import { listerEntretiens } from "@/server/services/stats-service";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { BadgeEntretien, BadgeQualite } from "@/components/app/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { formatDateHeureFr, formatDuree, LIBELLES_STATUT_APPEL } from "@/lib/format";
import { Eye } from "lucide-react";

export const metadata = { title: "Entretiens — UNITED Research" };
export const dynamic = "force-dynamic";

/**
 * Interviews list (manager / supervisor). Aggregate view: respondent PII is
 * NOT displayed here — only internal IDs (PII separation requirement).
 */
export default async function PageEntretiens({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; qualite?: string; page?: string }>;
}) {
  await exigerAcces(["ADMINISTRATEUR"]);
  const filtres = await searchParams;
  const page = Number(filtres.page ?? "1") || 1;

  const resultat = await listerEntretiens({
    statut: filtres.statut,
    qualite: filtres.qualite,
    page,
  });

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Entretiens"
        description="Historique complet des tentatives d'entretien, avec leur version d'enquête exacte et leur statut qualité."
      />

      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Statut</span>
          <select name="statut" defaultValue={filtres.statut ?? "TOUS"} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
            {["TOUS", "EN_COURS", "TERMINE", "ABANDONNE"].map((s) => (
              <option key={s} value={s}>
                {s === "TOUS" ? "Tous" : s === "EN_COURS" ? "En cours" : s === "TERMINE" ? "Terminé" : "Abandonné"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Qualité</span>
          <select name="qualite" defaultValue={filtres.qualite ?? "TOUS"} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
            {["TOUS", "NON_EXAMINE", "A_EXAMINER", "VALIDE", "REJETE", "FAUX_POSITIF"].map((s) => (
              <option key={s} value={s}>
                {s === "TOUS" ? "Tous" : s.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Filtrer
        </button>
      </form>

      {resultat.entretiens.length === 0 ? (
        <EtatVide titre="Aucun entretien" description="Les entretiens apparaîtront dès que les agents auront démarré des sessions." />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto scroll-fin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Début</TableHead>
                    <TableHead>Enquête</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead>Résultat</TableHead>
                    <TableHead className="text-right">Réponses</TableHead>
                    <TableHead className="text-right">Durée</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Qualité</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultat.entretiens.map((entretien) => (
                    <TableRow key={entretien.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateHeureFr(entretien.startedAt)}</TableCell>
                      <TableCell className="text-sm">
                        {entretien.surveyVersion.survey.title} — v{entretien.surveyVersion.versionNumber}
                      </TableCell>
                      <TableCell className="text-sm">{entretien.agent.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {entretien.respondent.name ?? <span className="font-mono text-xs text-muted-foreground">#{entretien.respondent.id.slice(-8)}</span>}
                      </TableCell>
                      <TableCell>
                        {entretien.callAttempt ? (
                          <Badge
                            variant="outline"
                            className={
                              entretien.callAttempt.status === "TERMINE"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : entretien.callAttempt.status === "NE_PAS_RAPPELER"
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-border bg-muted"
                            }
                          >
                            {LIBELLES_STATUT_APPEL[entretien.callAttempt.status] ?? entretien.callAttempt.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm chiffre-cle">{entretien._count.answers}</TableCell>
                      <TableCell className="text-right text-sm">{formatDuree(entretien.durationSeconds)}</TableCell>
                      <TableCell><BadgeEntretien statut={entretien.status} /></TableCell>
                      <TableCell>
                        <BadgeQualite statut={entretien.qualityStatus} />
                        {entretien._count.qualityFlags > 0 && (
                          <span className="ml-1.5 text-xs text-amber-600">({entretien._count.qualityFlags})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline" className="gap-1.5">
                          <Link href={`/entretiens/${entretien.id}`}>
                            <Eye className="h-3.5 w-3.5" /> Voir le détail
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{resultat.total} entretien(s) — page {resultat.page} / {Math.max(1, resultat.pages)}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/entretiens?statut=${filtres.statut ?? "TOUS"}&qualite=${filtres.qualite ?? "TOUS"}&page=${page - 1}`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
                  ← Précédente
                </Link>
              )}
              {page < resultat.pages && (
                <Link href={`/entretiens?statut=${filtres.statut ?? "TOUS"}&qualite=${filtres.qualite ?? "TOUS"}&page=${page + 1}`} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50">
                  Suivante →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
