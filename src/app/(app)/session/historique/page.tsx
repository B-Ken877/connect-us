import Link from "next/link";
import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EnTetePage } from "@/components/app/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateHeureFr } from "@/lib/format";
import { ChevronLeft, PhoneCall } from "lucide-react";

export const metadata = { title: "Historique de mes appels — UNITED Research" };
export const dynamic = "force-dynamic";

const LIBELLES_STATUT: Record<string, string> = {
  TERMINE: "Terminé",
  SANS_REPONSE: "Sans réponse",
  OCCUPE: "Occupé",
  MESSAGERIE: "Messagerie vocale",
  NUMERO_INCORRECT: "Mauvais numéro",
  REFUS: "Refusé",
  RAPPEL: "Rappel demandé",
  NE_PAS_RAPPELER: "Ne plus appeler",
  AUTRE: "Autre",
  ABANDONNE: "Abandonné",
  EN_COURS: "En cours",
};

export default async function PageHistorique() {
  const session = await exigerAcces(["AGENT", "ADMINISTRATEUR"]);

  const appels = await db.callAttempt.findMany({
    where: { agentId: session.sub, status: { not: "EN_COURS" } },
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      respondent: { select: { id: true, name: true, phone: true } },
      interview: {
        select: {
          id: true,
          status: true,
          surveyVersion: { select: { survey: { select: { title: true } } } },
        },
      },
    },
  });

  const total = appels.length;
  const termines = appels.filter((a) => a.status === "TERMINE").length;
  const optOuts = appels.filter((a) => a.status === "NE_PAS_RAPPELER").length;

  return (
    <div className="mx-auto max-w-5xl">
      <EnTetePage
        titre="Historique de mes appels"
        description="Vos 100 derniers appels enregistrés. Les fiches des autres agents ne sont pas accessibles."
        actions={
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/session">
              <ChevronLeft className="h-4 w-4" /> Retour à la session
            </Link>
          </Button>
        }
      />

      {/* Résumé rapide */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="libelle-section">Total appels</p>
          <p className="chiffre-cle mt-1 text-2xl font-semibold text-foreground">{total}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="libelle-section">Terminés</p>
          <p className="chiffre-cle mt-1 text-2xl font-semibold text-success">{termines}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="libelle-section">Opt-outs</p>
          <p className="chiffre-cle mt-1 text-2xl font-semibold text-destructive">{optOuts}</p>
        </div>
      </div>

      {/* Tableau des appels */}
      {appels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
          <PhoneCall className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">Aucun appel enregistré pour le moment</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Commencez votre session et passez votre premier appel pour voir l&apos;historique ici.
          </p>
          <Button asChild className="mt-4 gap-2">
            <Link href="/session">
              <PhoneCall className="h-4 w-4" /> Commencer une session
            </Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/50 px-4 py-3">
            <p className="libelle-section">Appels récents</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="hidden md:table-cell">Campagne</TableHead>
                <TableHead>Résultat</TableHead>
                <TableHead className="hidden lg:table-cell">Durée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appels.map((appel) => (
                <TableRow key={appel.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateHeureFr(appel.startedAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {appel.respondent.name ?? "Contact anonyme"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {appel.interview?.surveyVersion.survey.title ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        appel.status === "TERMINE"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : appel.status === "NE_PAS_RAPPELER"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-border bg-muted"
                      }
                    >
                      {LIBELLES_STATUT[appel.status] ?? appel.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {appel.durationSeconds
                      ? `${Math.floor(appel.durationSeconds / 60)}m ${appel.durationSeconds % 60}s`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
