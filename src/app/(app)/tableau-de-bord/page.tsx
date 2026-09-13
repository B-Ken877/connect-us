import Link from "next/link";
import { exigerAcces } from "@/lib/auth/session";
import { statistiquesGestionnaire } from "@/server/services/stats-service";
import { CarteStat, EnTetePage } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { formatDuree } from "@/lib/format";
import { Plus, ClipboardList, Activity, ShieldCheck, Users, PhoneCall, Ban, Megaphone } from "lucide-react";

export const metadata = { title: "Tableau de bord — UNITED Research" };
export const dynamic = "force-dynamic";

export default async function PageTableauDeBord() {
  await exigerAcces(["ADMINISTRATEUR"]);
  const stats = await statistiquesGestionnaire();
  const maxJour = Math.max(1, ...stats.entretiens7Jours.map((j) => j.total));

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Tableau de bord"
        description="Vue opérationnelle de la plateforme : campagnes, appels, agents et conformité."
        actions={
          <Button asChild className="gap-2">
            <Link href="/enquetes/nouveau">
              <Plus className="h-4 w-4" /> Nouvelle campagne
            </Link>
          </Button>
        }
      />

      {/* Carte campagne active — en premier, visuellement dominante */}
      {stats.campagneActive ? (
        <div className="mb-6 rounded-lg border border-primary/20 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="libelle-section mb-1 text-primary">Campagne active</p>
              <h2 className="text-lg font-semibold text-foreground">{stats.campagneActive.titre}</h2>
              {stats.campagneActive.candidat && (
                <p className="mt-0.5 text-sm text-muted-foreground">{stats.campagneActive.candidat}</p>
              )}
              {stats.versionActive && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Version {stats.versionActive.versionNumber} en cours de passation
                </p>
              )}
            </div>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={`/enquetes/${stats.campagneActive.id}`}>
                <Megaphone className="h-3.5 w-3.5" /> Ouvrir la campagne
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune campagne active pour le moment.{" "}
            <Link href="/enquetes/nouveau" className="font-medium text-primary hover:underline">
              Créer une campagne →
            </Link>
          </p>
        </div>
      )}

      {/* Cartes statistiques — vraies valeurs DB */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CarteStat
          libelle="Agents actifs"
          valeur={`${stats.agentsActifs}/${stats.agentsTotal}`}
          detail="comptes agents activés"
        />
        <CarteStat
          libelle="Appels aujourd'hui"
          valeur={stats.appelsAujourdhui}
          ton="neutre"
          detail={`${stats.entretiensAujourdHui} entretiens terminés`}
        />
        <CarteStat
          libelle="Fiches d'appel terminées"
          valeur={stats.entretiensTotal}
          ton="positif"
          detail="cumul total"
        />
        <CarteStat
          libelle="Contacts restants"
          valeur={stats.repondantsRestants}
          detail={`${stats.repondantsInterroges} déjà appelés`}
        />
      </div>

      {/* Deuxième rangée — conformité et qualité */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CarteStat
          libelle="Demandes de ne plus appeler"
          valeur={stats.optOuts}
          ton={stats.optOuts > 0 ? "alerte" : "neutre"}
          detail="opt-outs (NE_PAS_RAPPELER)"
        />
        <CarteStat
          libelle="Contacts disponibles"
          valeur={stats.repondantsRestants}
          detail="dans la file d'appels"
        />
        <CarteStat
          libelle="Campagnes publiées"
          valeur={stats.enquetesPubliees}
          detail={`${stats.enquetesTotal} au total`}
        />
        <CarteStat
          libelle="Signalements qualité"
          valeur={stats.signalementsOuverts}
          ton={stats.signalementsOuverts > 0 ? "alerte" : "neutre"}
          detail="à examiner"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <p className="libelle-section">Fiches d&apos;appel terminées — 7 derniers jours</p>
          <div className="mt-5 flex h-44 items-end gap-3" role="img" aria-label="Fiches d'appel par jour sur 7 jours">
            {stats.entretiens7Jours.map((jour) => (
              <div key={jour.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">{jour.total > 0 ? jour.total : ""}</span>
                <div
                  className="w-full max-w-12 rounded-t-md bg-primary/85 transition-all"
                  style={{ height: `${Math.max(4, (jour.total / maxJour) * 140)}px` }}
                />
                <span className="text-[11px] text-muted-foreground">
                  {new Date(`${jour.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="libelle-section">Indicateurs</p>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Durée moyenne d&apos;un appel</dt>
                <dd className="font-medium">{formatDuree(stats.dureeMoyenneSecondes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Versions publiées</dt>
                <dd className="font-medium">{stats.versionsPubliees}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total contacts</dt>
                <dd className="font-medium">{stats.repondantsTotal}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline" size="sm" className="flex-1 gap-2">
                <Link href="/supervision">
                  <Activity className="h-3.5 w-3.5" /> Supervision
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="flex-1 gap-2">
                <Link href="/controle-qualite">
                  <ShieldCheck className="h-3.5 w-3.5" /> Qualité
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <p className="libelle-section">Accès rapides</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button asChild variant="ghost" size="sm" className="gap-2 justify-start">
                <Link href="/agents">
                  <Users className="h-3.5 w-3.5" /> Agents
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="gap-2 justify-start">
                <Link href="/repondants">
                  <PhoneCall className="h-3.5 w-3.5" /> Contacts
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="gap-2 justify-start">
                <Link href="/entretiens">
                  <ClipboardList className="h-3.5 w-3.5" /> Fiches d&apos;appel
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="gap-2 justify-start">
                <Link href="/enquetes">
                  <Megaphone className="h-3.5 w-3.5" /> Campagnes
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
