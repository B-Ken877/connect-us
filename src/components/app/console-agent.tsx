"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BadgeAgent } from "@/components/app/badges";
import { PhoneCall, Pause, Play, LoaderCircle, ShieldAlert, UserRound, FileText } from "lucide-react";
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
  entretienActif: { interviewId: string; nom: string | null; telephone: string } | null;
  versionActive: { titre: string; versionNumber: number; nbQuestions: number } | null;
  scriptIntro?: { script: string; candidat?: string | null; conformite?: string | null } | null;
  dialer: DialerMeta;
}

/**
 * AGENT DASHBOARD — deliberately calm. One primary action (resume the active
 * interview, or call the next respondent), presence control, and TODAY'S
 * stats kept visually secondary: numbers never compete with the workflow.
 *
 * UNITED Research: le script d'introduction est affiché en grand quand
 * disponible — c'est l'élément le plus important pour l'agent.
 */
export function ConsoleAgent({ prenom, nomComplet, statsInitiales, entretienActif, versionActive, scriptIntro, dialer }: Props) {
  const router = useRouter();
  const [stats, setStats] = useState<StatsAgent>(statsInitiales);
  const [entretien, setEntretien] = useState(entretienActif);
  const [fileVide, setFileVide] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const verrouAppel = useRef(false);

  // Near-real-time refresh: short polling (15 s) — heartbeat included.
  const rafraichir = useCallback(async () => {
    try {
      const reponse = await fetch("/api/session/etat", { cache: "no-store" });
      if (!reponse.ok) return;
      const donnees = await reponse.json();
      setStats(donnees.stats as StatsAgent);
      setEntretien(donnees.entretienActif ?? null);
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
    setFileVide(false);
    const r = await actionAppelerSuivant();
    setEnCours(false);
    verrouAppel.current = false;
    if (!r.succes || !r.data) {
      toast({ title: "Erreur", description: r.message ?? "Action impossible.", variant: "destructive" });
      return;
    }
    if ("fileVide" in r.data) {
      setFileVide(true);
      return;
    }
    // Interview-first workflow: straight into the workspace.
    router.push(`/session/entretien/${r.data.interviewId}`);
  }

  const horsLigne = stats.statutSession === "HORS_LIGNE";
  const enPause = stats.statutSession === "EN_PAUSE";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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
        <Card className="border-primary/30">
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
              Espace de travail
            </CardTitle>
            <CardDescription>
              {entretien
                ? "Vous avez un entretien en cours — reprenez-le directement, sans rappeler."
                : "Le prochain répondant vous sera attribué automatiquement, questionnaire prêt à l'écran."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entretien ? (
              <Button
                size="lg"
                className="w-full h-14 text-base gap-2"
                onClick={() => router.push(`/session/entretien/${entretien.interviewId}`)}
              >
                <UserRound className="h-5 w-5" />
                Reprendre l&apos;entretien — {entretien.nom ?? "Répondant"}
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
            {fileVide && !entretien && (
              <p className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-2 text-center text-xs text-muted-foreground">
                File d&apos;attente vide — aucun répondant disponible pour le moment.
              </p>
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

      {/* Script d'introduction — UNITED Research — élément visuellement dominant */}
      {scriptIntro && scriptIntro.script && (
        <Card className="border-primary/20 bg-card">
          <CardHeader className="pb-3">
            {scriptIntro.candidat && (
              <p className="libelle-section mb-1 text-primary">{scriptIntro.candidat}</p>
            )}
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Script d&apos;introduction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scriptIntro.script.split("\n").map((ligne, i) => (
                <p key={i} className="text-base leading-relaxed text-foreground">
                  {ligne || "\u00A0"}
                </p>
              ))}
            </div>
            {scriptIntro.conformite && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-900">{scriptIntro.conformite}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats — visually secondary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Aujourd&apos;hui</span>
        <span className="text-slate-700"><strong className="font-semibold">{stats.appelsAujourdHui}</strong> appels</span>
        <span className="text-teal-700"><strong className="font-semibold">{stats.entretiensTermines}</strong> terminés</span>
        <span className="text-amber-600"><strong className="font-semibold">{stats.rappelsPlanifies}</strong> rappels</span>
        <span className="text-red-600"><strong className="font-semibold">{stats.refus}</strong> refus</span>
        <span className="text-slate-700"><strong className="font-semibold">{stats.sansReponse}</strong> sans réponse</span>
      </div>

      {stats.signalementsOuverts > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {stats.signalementsOuverts} de vos entretiens font l&apos;objet d&apos;un contrôle qualité en cours d&apos;examen.
        </div>
      )}

      <p className="border-t border-slate-200 pt-4 text-xs text-muted-foreground">
        {nomComplet} · Composeur : {dialer.label}
      </p>
    </div>
  );
}
