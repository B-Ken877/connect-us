import { exigerAcces } from "@/lib/auth/session";
import { listerUtilisateurs } from "@/server/services/user-service";
import { EnTetePage } from "@/components/app/primitives";
import { GestionUtilisateurs } from "@/components/app/gestion-utilisateurs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateHeureFr } from "@/lib/format";
import { LIBELLES_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";

export const metadata = { title: "Agents & comptes — UNITED Research" };
export const dynamic = "force-dynamic";

export default async function PageAgents() {
  const session = await exigerAcces(["ADMINISTRATEUR"]);
  const utilisateurs = await listerUtilisateurs();

  const serialized = utilisateurs.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as RoleUtilisateur,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Agents & comptes"
        description="Gestion des comptes du centre : création, rôles, activation. Toute modification de rôle est journalisée."
      />

      <GestionUtilisateurs utilisateurs={serialized} utilisateurCourantId={session.sub} />

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="libelle-section">Comptes existants</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead className="hidden md:table-cell">E-mail</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="hidden lg:table-cell">Créé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {utilisateurs.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50">
                    {LIBELLES_ROLE[u.role as RoleUtilisateur]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {u.active ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Actif</Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Désactivé</Badge>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                  {formatDateHeureFr(u.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
