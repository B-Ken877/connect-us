import { exigerAcces } from "@/lib/auth/session";
import { listerSignalements } from "@/server/services/quality-service";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { BadgeSeverite, BadgeQualite } from "@/components/app/badges";
import { ExamenSignalement } from "@/components/app/examen-signalement";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateHeureFr, formatDuree, LIBELLES_TYPE_SIGNALEMENT } from "@/lib/format";

export const metadata = { title: "Contrôle qualité — GIG Survey" };
export const dynamic = "force-dynamic";

const STATUTS = ["A_EXAMINER", "VALIDE", "REJETE", "FAUX_POSITIF", "TOUS"];
const TYPES = ["TOUS", ...Object.keys(LIBELLES_TYPE_SIGNALEMENT)];

function libelleStatutFiltre(s: string) {
  switch (s) {
    case "A_EXAMINER": return "À examiner";
    case "VALIDE": return "Validé";
    case "REJETE": return "Rejeté";
    case "FAUX_POSITIF": return "Faux positif";
    default: return "Tous les statuts";
  }
}

export default async function PageControleQualite({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; type?: string }>;
}) {
  await exigerAcces(["ADMINISTRATEUR"]);
  const filtres = await searchParams;
  const statut = STATUTS.includes(filtres.statut ?? "") ? filtres.statut! : "A_EXAMINER";
  const type = TYPES.includes(filtres.type ?? "") ? filtres.type! : "TOUS";

  const signalements = await listerSignalements({ statut, type });

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Contrôle qualité"
        description="Signalements générés automatiquement par le moteur qualité. Aucune donnée n'est supprimée : chaque signalement est examiné et tracé."
      />

      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Statut</span>
          <select
            name="statut"
            defaultValue={statut}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {STATUTS.map((s) => (
              <option key={s} value={s}>{libelleStatutFiltre(s)}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Type de signalement</span>
          <select
            name="type"
            defaultValue={type}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "TOUS" ? "Tous les types" : LIBELLES_TYPE_SIGNALEMENT[t]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtrer
        </button>
      </form>

      {signalements.length === 0 ? (
        <EtatVide
          titre="Aucun signalement"
          description={
            statut === "A_EXAMINER"
              ? "Aucun signalement en attente d'examen. Le moteur qualité relève les durées suspectes, doublons, répétitions et incohérences."
              : "Aucun signalement ne correspond aux filtres sélectionnés."
          }
        />
      ) : (
        <div className="space-y-3">
          {signalements.map((signalement) => (
            <Card key={signalement.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {LIBELLES_TYPE_SIGNALEMENT[signalement.type] ?? signalement.type}
                      </span>
                      <BadgeSeverite severite={signalement.severity} />
                      <BadgeQualite statut={signalement.status} />
                    </div>
                    <p className="mt-2 max-w-3xl text-sm text-slate-800">{signalement.reason}</p>
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Agent : <strong className="font-medium text-slate-700">{signalement.agent?.name ?? "—"}</strong>
                      </span>
                      {signalement.interview && (
                        <span>
                          Entretien : {signalement.interview.surveyVersion.survey.title} — v{signalement.interview.surveyVersion.versionNumber}
                        </span>
                      )}
                      <span>Détecté le {formatDateHeureFr(signalement.createdAt)}</span>
                      {signalement.interview?.durationSeconds && (
                        <span>Durée : {formatDuree(signalement.interview.durationSeconds)}</span>
                      )}
                      {signalement.reviewedAt && (
                        <span>
                          Examiné le {formatDateHeureFr(signalement.reviewedAt)}
                          {signalement.reviewComment ? ` — « ${signalement.reviewComment} »` : ""}
                        </span>
                      )}
                    </p>
                    {signalement.interview && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        Réf. entretien {signalement.interview.id}
                      </p>
                    )}
                  </div>
                  <ExamenSignalement
                    signalementId={signalement.id}
                    statutActuel={signalement.status}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Rappel : les décisions d&apos;examen sont journalisées dans le registre d&apos;audit. Les données
        collectées ne sont jamais détruites automatiquement.
      </p>
    </div>
  );
}
