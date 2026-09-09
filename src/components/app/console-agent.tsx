"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CarteStat } from "@/components/app/primitives";
import { BadgeAgent } from "@/components/app/badges";
import { PhoneCall, Pause, Play, LoaderCircle, Users, ClipboardList, CalendarClock, ThumbsDown, PhoneMissed, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  actionDemarrerSession,
  actionChangerEtat,
  actionAppelerSuivant,
} from "@/server/actions/agent-actions";
import type { StatsAgent } from "@/server/services/stats-service";
import type { DialerMeta } from "@/lib/dialer/types";

interface Props {
  prenom: string;
  nomComplet: string;
  statsInitiales: StatsAgent;
  appelActif: { appelId: string; nom: string | null; telephone: string } | null;
  versionActive: { titre: string; versionNumber: number; nbQuestions: number } | null;
  dialer: DialerMeta;
}

/**
 * Agent dashboard: greeting, presence state, today's stats and ONE main
 * action. Administrative noise is deliberately excluded from this screen.
 */
export function ConsoleAgent({ prenom, nomComplet, statsInitiales, appelActif, versionActive, dialer }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<StatsAgent>(statsInitiales);
  const [enCours, setEnCours] = useState(false);
  const [appelEnCours, setAppelEnCours] = useState(appelActif);
  const verrouAppel = useRef(false);

  // Near-real-time refresh: short polling (15 s) — heartbeat included.
  const rafraichir = useCallback(async () => {
    try {
      const reponse = await fetch("/api/session/etat", { cache: "no-store" });
      if (!reponse.ok) return;
      const donnees = await reponse.json();
      setStats(donnees.stats as StatsAgent);
      setAppelEnCours(donnees.appelActif ?? null);
    } catch {
      // network hiccup — keep last known state
    }
  }, []);

  useEffect(() => {
    const t = setInterval(rafraichir, 15_000);
    return () => clearInterval(t);
  }, [rafraichir]);

  async function demarrerSession() {
    setEnCours(true);
    const r = await actionDemarrerSession();
    setEnCours(false);
    if (r.succes) {
      toast({ title: "Session démarrée", description: "Vous êtes maintenant disponible." });
      rafraichir();
    } else {
      toast({ title: "Erreur", description: r.message, variant: "destructive" });
    }
  }

  async function changerEtat(statut: "DISPONIBLE" | "EN_PAUSE") {
    setEnCours(true);
    const r = await actionChangerEtat(statut);
    setEnCours(false);
    if (r.succes) rafraichir();
    else toast({ title: "Erreur", description: r.message, variant: "destructive" });
  }

  async function appelerSuivant() {
    if (verrouAppel.current) return;
    verrouAppel.current = true;
    setEnCours(true);
    const r = await actionAppelerSuivant();
    setEnCours(false);
    verrouAppel.current = false;
    if (!r.succes || !r.data) {
      toast({ title: "Erreur", description: r.message ?? "Action impossible.", variant: "destructive" });
      return;
    }
    if ("fileVide" in r.data) {
      toast({ title: "File d'attente vide", description: "Aucun répondant disponible pour le moment." });
      return;
    }
    if (r.data.etape === "ENTRETIEN" && r.data.interviewId) {
      router.push(`/session/entretien/${r.data.interviewId}`);
      return;
    }
    router.push(`/session/appel/${r.data.appelId}`);
  }

  const horsLigne = stats.statutSession === "HORS_LIGNE";
  const enPause = stats.statutSession === "EN_PAUSE";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Bonjour,</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{prenom}</h1>
        </div>
        <div className="flex items-center gap-3">
          <BadgeAgent statut={stats.statutSession} />
          {!horsLigne && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => changerEtat(enPause ? "DISPONIBLE" : "EN_PAUSE")}
              disabled={enCours}
              className="gap-2"
            >
              {enPause ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {enPause ? "Reprendre" : "Passer en pause"}
            </Button>
          )}
        </div>
      </div>

      {horsLigne ? (
        <Card className="border-primary/30 bg-gradient-to-b from-white to-teal-50/40">
          <CardHeader className="items-center text-center">
            <CardTitle>Prêt à commencer votre session ?</CardTitle>
            <CardDescription>
              Démarrer la session vous rend « Disponible » et vous permet de recevoir des répondants.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pb-6">
            <Button size="lg" className="h-12 px-8 text-base gap-2" onClick={demarrerSession} disabled={enCours}>
              {enCours ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <PhoneCall className="h-5 w-5" />}
              Commencer la session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="h-4 w-4 text-primary" />
              Appel suivant
            </CardTitle>
            <CardDescription>
              {appelEnCours
                ? "Un appel est en cours — reprenez là où vous vous êtes arrêté."
                : "Le prochain répondant disponible vous sera attribué automatiquement."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {appelEnCours ? (
              <Button size="lg" className="w-full h-14 text-base gap-2" onClick={() => router.push(`/session/appel/${appelEnCours.appelId}`)}>
                <PhoneCall className="h-5 w-5" />
                Reprendre l&apos;appel en cours — {appelEnCours.nom ?? "Répondant"}
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full h-14 text-base gap-2"
                onClick={appelerSuivant}
                disabled={enCours || enPause || !versionActive}
              >
                {enCours ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <PhoneCall className="h-5 w-5" />}
                Appeler le répondant suivant
              </Button>
            )}
            {!versionActive && (
              <p className="mt-3 text-center text-xs text-amber-600">
                Aucune enquête publiée pour le moment — demandez au gestionnaire de publier une version.
              </p>
            )}
            {versionActive && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Enquête active : {versionActive.titre} — version {versionActive.versionNumber} ({versionActive.nbQuestions} questions)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <CarteStat libelle="Appels aujourd'hui" valeur={stats.appelsAujourdHui} />
        <CarteStat libelle="Entretiens terminés" valeur={stats.entretiensTermines} ton="positif" />
        <CarteStat libelle="Rappels planifiés" valeur={stats.rappelsPlanifies} ton="alerte" />
        <CarteStat libelle="Refus" valeur={stats.refus} ton="critique" />
        <CarteStat libelle="Sans réponse" valeur={stats.sansReponse} />
      </div>

      {stats.signalementsOuverts > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {stats.signalementsOuverts} de vos entretiens font l&apos;objet d&apos;un contrôle qualité en cours d&apos;examen.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Répondants attribués automatiquement</span>
        <span className="flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Progression sauvegardée en continu</span>
        <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> Rappels planifiables</span>
        <span className="flex items-center gap-1.5"><ThumbsDown className="h-3.5 w-3.5" /> Refus enregistrables</span>
        <span className="flex items-center gap-1.5"><PhoneMissed className="h-3.5 w-3.5" /> Sans réponse / Occupé</span>
        <span className="ml-auto">Composeur : {dialer.label}</span>
      </div>
    </div>
  );
}
