import { exigerAcces } from "@/lib/auth/session";
import { listerRepondants } from "@/server/services/respondent-service";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { BadgeRepondant } from "@/components/app/badges";
import { FormulaireRepondant } from "@/components/app/formulaire-repondant";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

export const metadata = { title: "Répondants — GIG Survey" };
export const dynamic = "force-dynamic";

export default async function PageRepondants({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  await exigerAcces(["ADMINISTRATEUR", "GESTIONNAIRE", "SUPERVISEUR"]);
  const filtres = await searchParams;
  const page = Number(filtres.page ?? "1") || 1;

  const resultat = await listerRepondants({
    recherche: filtres.q,
    statut: filtres.statut,
    page,
  });

  const pagesFiltre = ["TOUS", "DISPONIBLE", "RAPPEL_PLANIFIE", "INTERROGE", "INJOIGNABLE", "EXCLU"];

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Répondants"
        description="Base de contact du centre. Les identités sont séparées des réponses d'enquête : seuls les rôles habilités accèdent à cette page."
        actions={<FormulaireRepondant />}
      />

      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Recherche (nom, téléphone, réf.)</span>
          <input
            name="q"
            defaultValue={filtres.q ?? ""}
            placeholder="Ex. Martin ou 0612…"
            className="h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">Statut</span>
          <select name="statut" defaultValue={filtres.statut ?? "TOUS"} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
            {pagesFiltre.map((s) => (
              <option key={s} value={s}>{s === "TOUS" ? "Tous" : s.replace(/_/g, " ").toLowerCase()}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Filtrer
        </button>
      </form>

      {resultat.repondants.length === 0 ? (
        <EtatVide titre="Aucun répondant trouvé" description="Ajustez la recherche ou ajoutez des répondants au vivier." />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto scroll-fin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead className="hidden md:table-cell">Référence</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="hidden lg:table-cell">Assigné à</TableHead>
                    <TableHead className="text-right">Entretiens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultat.repondants.map((repondant) => (
                    <TableRow key={repondant.id}>
                      <TableCell className="font-medium">{repondant.name ?? <span className="text-muted-foreground">Non renseigné</span>}</TableCell>
                      <TableCell className="chiffre-cle font-mono text-sm">{repondant.phone}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {repondant.externalRef ?? "—"}
                      </TableCell>
                      <TableCell><BadgeRepondant statut={repondant.status} /></TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{repondant.assignedTo?.name ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{repondant._count.callAttempts}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {resultat.total} répondant(s) — page {resultat.page} / {Math.max(1, resultat.pages)}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/repondants?${new URLSearchParams({ ...(filtres.q ? { q: filtres.q } : {}), statut: filtres.statut ?? "TOUS", page: String(page - 1) })}`}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
                >
                  ← Précédente
                </Link>
              )}
              {page < resultat.pages && (
                <Link
                  href={`/repondants?${new URLSearchParams({ ...(filtres.q ? { q: filtres.q } : {}), statut: filtres.statut ?? "TOUS", page: String(page + 1) })}`}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50"
                >
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
