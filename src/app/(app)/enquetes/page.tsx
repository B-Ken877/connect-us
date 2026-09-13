import Link from "next/link";
import { exigerAcces } from "@/lib/auth/session";
import { listerEnquetes } from "@/server/services/survey-service";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { BadgeStatutVersion } from "@/components/app/badges-enquete";
import { Button } from "@/components/ui/button";
import { formatDateHeureFr } from "@/lib/format";
import { Plus, ChevronRight } from "lucide-react";

export const metadata = { title: "Enquêtes — UNITED Research" };
export const dynamic = "force-dynamic";

export default async function PageEnquetes() {
  await exigerAcces(["ADMINISTRATEUR"]);
  const enquetes = await listerEnquetes();

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Enquêtes"
        description="Créez, éditez et publiez vos questionnaires. Chaque publication fige une version immuable."
        actions={
          <Button asChild className="gap-2">
            <Link href="/enquetes/nouveau">
              <Plus className="h-4 w-4" /> Nouvelle enquête
            </Link>
          </Button>
        }
      />

      {enquetes.length === 0 ? (
        <EtatVide
          titre="Aucune enquête pour le moment"
          description="Créez votre première enquête, ajoutez vos questions puis publiez une version 1."
          action={
            <Button asChild className="gap-2">
              <Link href="/enquetes/nouveau">
                <Plus className="h-4 w-4" /> Créer une enquête
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-medium text-slate-600">Enquête</th>
                <th className="px-4 py-3 font-medium text-slate-600">Statut</th>
                <th className="hidden px-4 py-3 font-medium text-slate-600 md:table-cell">Versions</th>
                <th className="hidden px-4 py-3 font-medium text-slate-600 lg:table-cell">Créée par</th>
                <th className="hidden px-4 py-3 font-medium text-slate-600 lg:table-cell">Mise à jour</th>
                <th className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {enquetes.map((enquete) => {
                const publiee = enquete.versions.find((v) => v.status === "PUBLIEE");
                const brouillon = enquete.versions.find((v) => v.status === "BROUILLON");
                return (
                  <tr key={enquete.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{enquete.title}</p>
                      {enquete.description && (
                        <p className="mt-0.5 line-clamp-1 max-w-md text-xs text-muted-foreground">
                          {enquete.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <BadgeStatutVersion statut={enquete.status} />
                      {brouillon && (
                        <span className="ml-2 text-xs text-muted-foreground">(brouillon v{brouillon.versionNumber})</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-slate-700">
                        v{enquete.versions[0]?.versionNumber ?? 0}
                        {publiee && <span className="ml-1 text-xs text-emerald-700">· publiée</span>}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{enquete.createdBy.name}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{formatDateHeureFr(enquete.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/enquetes/${enquete.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Ouvrir <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
