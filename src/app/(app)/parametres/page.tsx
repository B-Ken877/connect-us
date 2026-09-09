import { exigerAcces } from "@/lib/auth/session";
import { EnTetePage, CarteStat } from "@/components/app/primitives";
import { db } from "@/lib/db";
import { obtenirDialerMeta } from "@/lib/dialer/registry";
import { config } from "@/lib/config";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateHeureFr } from "@/lib/format";
import { LIBELLES_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";
import { Database, PhoneCall, ShieldCheck } from "lucide-react";

export const metadata = { title: "Paramètres — GIG Survey" };
export const dynamic = "force-dynamic";

export default async function PageParametres() {
  const session = await exigerAcces(["ADMINISTRATEUR"]);
  const dialer = obtenirDialerMeta();

  const [nbUtilisateurs, nbRepondants, nbEntretiens, derniersAudits] = await Promise.all([
    db.user.count(),
    db.respondent.count(),
    db.interview.count(),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EnTetePage
        titre="Paramètres"
        description="Configuration de la plateforme et journal d'audit des actions sensibles."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CarteStat libelle="Comptes" valeur={nbUtilisateurs} />
        <CarteStat libelle="Répondants" valeur={nbRepondants} />
        <CarteStat libelle="Entretiens" valeur={nbEntretiens} ton="positif" />
        <CarteStat libelle="Session" valeur="12 h" detail="Durée de validité d'une session" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="h-4 w-4 text-primary" /> Composeur téléphonique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fournisseur actif</span>
              <span className="font-medium">{dialer.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Identifiant</span>
              <span className="font-mono text-xs">{dialer.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mode</span>
              <span className="font-medium">{dialer.mode === "client" ? "Côté appareil (tel:)" : "Côté serveur"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              L&apos;intégration téléphonie (api serveur) est prévue par l&apos;architecture
              <span className="font-mono"> DialerProvider</span> mais volontairement non activée tant
              qu&apos;aucun fournisseur n&apos;est retenu.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" /> Sécurité & données
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moteur qualité</span>
              <span className="font-medium">5 règles actives</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durée minimale suspecte</span>
              <span className="font-medium">{config.qualite.dureeMinimaleSecondes} s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Verrou de réponse</span>
              <span className="font-medium">{config.file.verrouMinutes} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base de données</span>
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="h-3.5 w-3.5 text-emerald-600" /> PostgreSQL
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Journal d&apos;audit — 30 dernières actions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto scroll-fin">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Horodatage</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden md:table-cell">Entité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {derniersAudits.map((entree) => (
                  <TableRow key={entree.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDateHeureFr(entree.createdAt)}</TableCell>
                    <TableCell className="text-sm">
                      {entree.user ? (
                        <>
                          {entree.user.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({LIBELLES_ROLE[entree.user.role as RoleUtilisateur]})
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Système</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{entree.action}</span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {entree.entityType}
                      {entree.entityId ? ` · ${entree.entityId.slice(0, 12)}…` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Connecté en tant que {session.nom} — consultation du {formatDateHeureFr(new Date())}.
      </p>
    </div>
  );
}
