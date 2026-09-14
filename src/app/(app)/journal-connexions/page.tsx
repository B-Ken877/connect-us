import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateHeureFr } from "@/lib/format";
import { ShieldAlert, Clock, Ban, LogIn, LogOut } from "lucide-react";

export const metadata = { title: "Journal de connexions — UNITED Research" };
export const dynamic = "force-dynamic";

// Actions à afficher dans le journal (connexions + refus + déconnexions auto)
const ACTIONS_SURVEILLEES = [
  "CONNEXION",
  "ECHEC_CONNEXION",
  "DECONNEXION",
  "CONNEXION_HORS_SHIFT",
  "DECONNEXION_FIN_SHIFT",
  "CONNEXION_IP_REFUSEE",
  "DECONNEXION_IP_REFUSEE",
];

const LIBELLES_ACTION: Record<string, string> = {
  CONNEXION: "Connexion réussie",
  ECHEC_CONNEXION: "Échec de connexion (identifiants)",
  DECONNEXION: "Déconnexion manuelle",
  CONNEXION_HORS_SHIFT: "Tentative hors shift",
  DECONNEXION_FIN_SHIFT: "Déconnexion fin de shift",
  CONNEXION_IP_REFUSEE: "Tentative IP non autorisée",
  DECONNEXION_IP_REFUSEE: "Déconnexion IP non autorisée",
};

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

  const [total, entrees] = await Promise.all([
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

  const pages = Math.max(1, Math.ceil(total / parPage));

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Journal de connexions"
        description="Toutes les tentatives de connexion, refus (hors shift, IP non autorisée) et déconnexions automatiques."
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Compte visé</TableHead>
                    <TableHead className="hidden md:table-cell">Rôle</TableHead>
                    <TableHead className="hidden lg:table-cell">Détails</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entrees.map((entree) => {
                    const meta = entree.metadata as Record<string, unknown> | null;
                    const ip = typeof meta?.ip === "string" ? meta.ip : "—";
                    const emailTente = typeof meta?.email === "string" ? meta.email : null;

                    // Icône + couleur selon le type d'action
                    const icone = iconePourAction(entree.action);
                    const badge = badgePourAction(entree.action);

                    return (
                      <TableRow key={entree.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {icone}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateHeureFr(entree.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entree.user ? (
                            <div>
                              <p className="font-medium text-foreground">{entree.user.name}</p>
                              <p className="text-xs text-muted-foreground">{entree.user.email}</p>
                            </div>
                          ) : emailTente ? (
                            <div>
                              <p className="font-medium text-foreground">Compte inconnu</p>
                              <p className="text-xs text-muted-foreground">{emailTente}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {entree.user?.role === "ADMINISTRATEUR" ? "Admin" : entree.user?.role === "AGENT" ? "Agent" : "—"}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs">
                          <div className="space-y-0.5">
                            <p><span className="text-muted-foreground">IP :</span> <span className="font-mono">{ip}</span></p>
                            {badge}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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

function iconePourAction(action: string): React.ReactElement {
  switch (action) {
    case "CONNEXION":
      return <LogIn className="h-4 w-4 text-emerald-600" />;
    case "DECONNEXION":
      return <LogOut className="h-4 w-4 text-slate-500" />;
    case "ECHEC_CONNEXION":
      return <ShieldAlert className="h-4 w-4 text-amber-600" />;
    case "CONNEXION_HORS_SHIFT":
      return <Clock className="h-4 w-4 text-amber-600" />;
    case "DECONNEXION_FIN_SHIFT":
      return <Clock className="h-4 w-4 text-slate-500" />;
    case "CONNEXION_IP_REFUSEE":
      return <Ban className="h-4 w-4 text-red-600" />;
    case "DECONNEXION_IP_REFUSEE":
      return <Ban className="h-4 w-4 text-red-600" />;
    default:
      return <ShieldAlert className="h-4 w-4 text-muted-foreground" />;
  }
}

function badgePourAction(action: string): React.ReactElement | null {
  const libelle = LIBELLES_ACTION[action];
  if (!libelle) return null;

  let className = "border-border bg-muted";
  if (action === "CONNEXION") {
    className = "border-emerald-200 bg-emerald-50 text-emerald-700";
  } else if (action === "CONNEXION_HORS_SHIFT" || action === "ECHEC_CONNEXION") {
    className = "border-amber-200 bg-amber-50 text-amber-700";
  } else if (action === "CONNEXION_IP_REFUSEE" || action === "DECONNEXION_IP_REFUSEE") {
    className = "border-red-200 bg-red-50 text-red-700";
  }

  return (
    <Badge variant="outline" className={className}>
      {libelle}
    </Badge>
  );
}
