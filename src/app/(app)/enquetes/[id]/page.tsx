import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { obtenirEnquete } from "@/server/services/survey-service";
import { EnTetePage } from "@/components/app/primitives";
import { BadgeStatutVersion } from "@/components/app/badges-enquete";
import { ActionsVersion } from "@/components/app/actions-version";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateHeureFr } from "@/lib/format";
import { FileDown, Eye, PencilLine } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PageEnquete({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigerAcces(["ADMINISTRATEUR", "GESTIONNAIRE"]);

  let enquete;
  try {
    enquete = await obtenirEnquete(id);
  } catch {
    notFound();
  }

  const brouillon = enquete.versions.find((v) => v.status === "BROUILLON");

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre={enquete.title}
        description={enquete.description ?? undefined}
        actions={
          <>
            {brouillon && (
              <Button asChild variant="outline" className="gap-2">
                <Link href={`/enquetes/${enquete.id}/apercu?version=${brouillon.id}`}>
                  <Eye className="h-4 w-4" /> Aperçu
                </Link>
              </Button>
            )}
            {brouillon && (
              <Button asChild className="gap-2">
                <Link href={`/enquetes/${enquete.id}/edition`}>
                  <PencilLine className="h-4 w-4" /> Éditer le brouillon
                </Link>
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Versions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scroll-fin">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-slate-600">Version</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">Statut</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">Questions</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">Entretiens</th>
                  <th className="px-4 py-2.5 font-medium text-slate-600">Publiée le</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {enquete.versions.map((version) => (
                  <tr key={version.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium">v{version.versionNumber}</td>
                    <td className="px-4 py-3">
                      <BadgeStatutVersion statut={version.status} />
                    </td>
                    <td className="px-4 py-3">{version._count.questions}</td>
                    <td className="px-4 py-3">{version._count.interviews}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {version.publishedAt ? formatDateHeureFr(version.publishedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ActionsVersion
                        enqueteId={enquete.id}
                        version={{ id: version.id, versionNumber: version.versionNumber, status: version.status }}
                        aBrouillon={Boolean(brouillon)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {enquete.versions.some((v) => v.status === "PUBLIEE") && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">
            <FileDown className="mr-1.5 inline h-4 w-4 text-primary" />
            Export CSV des réponses disponible par version publiée (action journalisée dans le
            registre d&apos;audit).
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Identifiant interne : <span className="font-mono">{enquete.id}</span> — créée le{" "}
        {formatDateHeureFr(enquete.createdAt)} par {enquete.createdBy.name}.
      </p>
    </div>
  );
}
