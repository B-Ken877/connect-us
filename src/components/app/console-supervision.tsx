"use client";

import { useEffect, useState } from "react";
import { CarteStat } from "@/components/app/primitives";
import { BadgeAgent } from "@/components/app/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, PhoneCall, ClipboardList, ThumbsDown, CalendarClock, PhoneMissed, ShieldAlert, Users } from "lucide-react";
import { formatDuree, formatPourcent } from "@/lib/format";
import type { StatsSupervision } from "@/server/services/stats-service";

/**
 * Supervisor console — near-real-time via 10 s polling (serverless-friendly;
 * WebSockets deliberately not used in V1).
 */
export function ConsoleSupervision({ donneesInitiales }: { donneesInitiales: StatsSupervision }) {
  const [stats, setStats] = useState<StatsSupervision>(donneesInitiales);
  const [erreur, setErreur] = useState<string | null>(null);
  const [derniere, setDerniere] = useState(new Date(donneesInitiales.genereA));

  useEffect(() => {
    let actif = true;
    async function boucle() {
      try {
        const r = await fetch("/api/supervision/metrics", { cache: "no-store" });
        if (!actif) return;
        if (!r.ok) {
          setErreur("Actualisation impossible — nouvelle tentative en cours.");
          return;
        }
        const donnees = (await r.json()) as StatsSupervision;
        setStats(donnees);
        setDerniere(new Date());
        setErreur(null);
      } catch {
        if (actif) setErreur("Actualisation impossible — nouvelle tentative en cours.");
      }
    }
    const t = setInterval(boucle, 10_000);
    return () => {
      actif = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Actualisation automatique toutes les 10 s — dernière mise à jour :{" "}
          {derniere.toLocaleTimeString("fr-FR", { timeZone: "America/New_York" })}
        </p>
        {erreur && <p className="text-xs font-medium text-amber-600">{erreur}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <CarteStat libelle="Agents connectés" valeur={stats.agentsConnectes} detail={`${stats.agentsDisponibles} disponibles`} />
        <CarteStat libelle="Appels en cours" valeur={stats.appelsEnCours} ton="positif" />
        <CarteStat libelle="Entretiens terminés" valeur={stats.entretiensTermines} />
        <CarteStat libelle="Rappels" valeur={stats.rappels} ton="alerte" />
        <CarteStat libelle="Refus" valeur={stats.refus} ton="critique" />
        <CarteStat libelle="Sans réponse" valeur={stats.sansReponse} />
        <CarteStat
          libelle="Entretiens signalés"
          valeur={stats.signalementsOuverts}
          ton={stats.signalementsOuverts > 0 ? "alerte" : "neutre"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> {stats.repondantsDisponibles} répondant(s) en file d&apos;attente</span>
        <span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-primary" /> {stats.agentsEnActivite} agent(s) en activité</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="libelle-section">Performance par agent — aujourd&apos;hui</p>
        </div>
        <div className="overflow-x-auto scroll-fin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Appels</TableHead>
                <TableHead className="text-right">Entretiens</TableHead>
                <TableHead className="text-right">Refus</TableHead>
                <TableHead className="text-right">Rappels</TableHead>
                <TableHead className="text-right">Taux de refus</TableHead>
                <TableHead className="text-right">Durée moy.</TableHead>
                <TableHead className="text-right">Signalements</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.lignesAgents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    Aucun agent actif enregistré.
                  </TableCell>
                </TableRow>
              ) : (
                stats.lignesAgents.map((ligne) => (
                  <TableRow key={ligne.agentId}>
                    <TableCell className="font-medium">{ligne.nom}</TableCell>
                    <TableCell><BadgeAgent statut={ligne.statut} /></TableCell>
                    <TableCell className="text-right chiffre-cle">{ligne.appels}</TableCell>
                    <TableCell className="text-right chiffre-cle">{ligne.entretiens}</TableCell>
                    <TableCell className="text-right chiffre-cle">{ligne.refus}</TableCell>
                    <TableCell className="text-right chiffre-cle">{ligne.rappels}</TableCell>
                    <TableCell className="text-right chiffre-cle">{formatPourcent(ligne.refus, ligne.appels)}</TableCell>
                    <TableCell className="text-right chiffre-cle">{formatDuree(ligne.dureeMoyenneSecondes)}</TableCell>
                    <TableCell className="text-right">
                      {ligne.signalements > 0 ? (
                        <span className="font-medium text-amber-600">{ligne.signalements}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-7">
        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Présence temps quasi réel</span>
        <span className="flex items-center gap-1.5"><PhoneCall className="h-3.5 w-3.5" /> Appels suivis</span>
        <span className="flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Entretiens consolidés</span>
        <span className="flex items-center gap-1.5"><ThumbsDown className="h-3.5 w-3.5" /> Refus</span>
        <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Rappels planifiés</span>
        <span className="flex items-center gap-1.5"><PhoneMissed className="h-3.5 w-3.5" /> Absences</span>
        <span className="flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Contrôles qualité</span>
      </div>
    </div>
  );
}
