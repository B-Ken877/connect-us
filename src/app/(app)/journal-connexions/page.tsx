import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LigneJournalCliquable, type EntreeJournal } from "@/components/app/ligne-journal";

export const metadata = { title: "Journal de connexions — UNITED Research" };
export const dynamic = "force-dynamic";

const ACTIONS_SURVEILLEES = [
  "CONNEXION",
  "ECHEC_CONNEXION",
  "DECONNEXION",
  "CONNEXION_HORS_SHIFT",
  "DECONNEXION_FIN_SHIFT",
  "CONNEXION_IP_REFUSEE",
  "DECONNEXION_IP_REFUSEE",
];

export default async function PageJournalConnexions({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await exigerAcces(["ADMINISTRATEUR"]);
  const filtres = await searchParams;
  const page = Number(filtres.page ?? "1") || 1;
  const parPage = 50;

  const where = {
    action: filtres.action && filtres.action !== "TOUS"
      ? filtres.action
      : { in: ACTIONS_SURVEILLEES },
  };

  const [total, entreesRaw] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
    }),
  ]);

  const entrees: EntreeJournal[] = entreesRaw.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    metadata: (e.metadata as Record<string, unknown> | null) ?? null,
    createdAt: e.createdAt.toISOString(),
    user: e.user ? { name: e.user.name, email: e.user.email, role: e.user.role } : null,
  }));

  const pages = Math.max(1, Math.ceil(total / parPage));

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Journal de connexions"
        description="Toutes les tentatives de connexion, refus (hors shift, IP non autorisée) et déconnexions automatiques. Cliquez sur une ligne pour voir le détail."
      />

      {/* Filtre */}
      <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Type d&apos;événement</span>
          <select
            name="action"
            defaultValue={filtres.action ?? "TOUS"}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="TOUS">Tous</option>
            <option value="CONNEXION">Connexions réussies</option>
            <option value="ECHEC_CONNEXION">Échecs (identifiants)</option>
            <option value="CONNEXION_HORS_SHIFT">Tentatives hors shift</option>
            <option value="CONNEXION_IP_REFUSEE">Tentatives IP non autorisée</option>
            <option value="DECONNEXION_FIN_SHIFT">Déconnexions fin de shift</option>
            <option value="DECONNEXION_IP_REFUSEE">Déconnexions IP non autorisée</option>
            <option value="DECONNEXION">Déconnexions manuelles</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Filtrer
        </button>
      </form>

      {entrees.length === 0 ? (
        <EtatVide
          titre="Aucun événement"
          description="Les tentatives de connexion et refus apparaîtront ici automatiquement."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto scroll-fin">
              <table className="w-full caption-bottom text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <TableHead className="w-20">Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Compte visé</TableHead>
                    <TableHead className="hidden md:table-cell">Rôle</TableHead>
                    <TableHead className="hidden lg:table-cell">Détails</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {entrees.map((entree) => (
                    <LigneJournalCliquable key={entree.id} entree={entree} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} événement(s) — page {page} / {pages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <a
                  href={`/journal-connexions?action=${filtres.action ?? "TOUS"}&page=${page - 1}`}
                  className="rounded-md border border-border bg-card px-3 py-1.5 hover:bg-muted"
                >
                  ← Précédente
                </a>
              )}
              {page < pages && (
                <a
                  href={`/journal-connexions?action=${filtres.action ?? "TOUS"}&page=${page + 1}`}
                  className="rounded-md border border-border bg-card px-3 py-1.5 hover:bg-muted"
                >
                  Suivante →
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
