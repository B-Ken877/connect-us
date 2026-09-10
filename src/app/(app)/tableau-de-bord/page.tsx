import Link from "next/link";
import { exigerAcces } from "@/lib/auth/session";
import { statistiquesGestionnaire } from "@/server/services/stats-service";
import { CarteStat, EnTetePage } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { formatDuree } from "@/lib/format";
import { Plus, ClipboardList, Activity, ShieldCheck } from "lucide-react";

export const metadata = { title: "Tableau de bord — GIG Survey" };
export const dynamic = "force-dynamic";

export default async function PageTableauDeBord() {
  await exigerAcces(["ADMINISTRATEUR"]);
  const stats = await statistiquesGestionnaire();
  const maxJour = Math.max(1, ...stats.entretiens7Jours.map((j) => j.total));

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Tableau de bord"
        description="Vue opérationnelle du centre d'enquêtes : production, répondants et qualité."
        actions={
          <Button asChild className="gap-2">
            <Link href="/enquetes/nouveau">
              <Plus className="h-4 w-4" /> Nouvelle enquête
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <CarteStat libelle="Enquêtes publiées" valeur={stats.enquetesPubliees} detail={`${stats.enquetesTotal} enquête(s) au total`} />
        <CarteStat libelle="Entretiens terminés" valeur={stats.entretiensTotal} ton="positif" detail={`${stats.entretiensAujourdHui} aujourd'hui`} />
        <CarteStat libelle="Répondants interrogés" valeur={stats.repondantsInterroges} detail={`${stats.repondantsRestants} restants à appeler`} />
        <CarteStat
          libelle="Signalements ouverts"
          valeur={stats.signalementsOuverts}
          ton={stats.signalementsOuverts > 0 ? "alerte" : "neutre"}
          detail="Contrôles qualité à examiner"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <p className="libelle-section">Entretiens terminés — 7 derniers jours</p>
          <div className="mt-5 flex h-44 items-end gap-3" role="img" aria-label="Entretiens par jour sur 7 jours">
            {stats.entretiens7Jours.map((jour) => (
              <div key={jour.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-medium text-slate-700">{jour.total > 0 ? jour.total : ""}</span>
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
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="libelle-section">Version active</p>
            {stats.versionActive ? (
              <div className="mt-2">
                <p className="text-sm font-medium text-slate-900">{stats.versionActive.titre}</p>
                <p className="text-xs text-muted-foreground">Version {stats.versionActive.versionNumber} en cours de passation</p>
                <Button asChild variant="outline" size="sm" className="mt-3 gap-2">
                  <Link href={`/enquetes/${stats.versionActive.enqueteId}`}>
                    <ClipboardList className="h-3.5 w-3.5" /> Ouvrir l&apos;enquête
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Aucune enquête publiée pour l&apos;instant.</p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="libelle-section">Indicateurs</p>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Durée moyenne</dt>
                <dd className="font-medium">{formatDuree(stats.dureeMoyenneSecondes)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Versions publiées</dt>
                <dd className="font-medium">{stats.versionsPubliees}</dd>
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
        </div>
      </div>
    </div>
  );
}
