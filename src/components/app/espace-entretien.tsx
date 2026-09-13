"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CircleCheck, LoaderCircle, PhoneCall, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { initierAppel } from "@/lib/dialer/client";
import type { DialerMeta } from "@/lib/dialer/types";
import { EnteteRepondant, type EtatAppel } from "@/components/app/entete-repondant";
import { PanneauDisposition } from "@/components/app/panneau-disposition";
import { InterviewRunner, type DonneesQuestionnaire } from "@/components/app/interview-runner";
import {
  actionAppelerSuivant,
  actionCloturerSansEntretien,
  actionSoumettreEntretien,
} from "@/server/actions/agent-actions";
import type { ReponsesParCle } from "@/lib/survey-engine";

/**
 * INTERVIEW WORKSPACE — the professional CATI operator console.
 *
 * ONE RESPONDENT → ONE WORKSPACE → ONE CALL BUTTON → ONE QUESTION AT A TIME →
 * ONE COMPLETION FLOW → NEXT RESPONDENT.
 *
 * Composition: EnteteRepondant (respondent + call controls) + InterviewRunner
 * (untouched survey engine) + PanneauDisposition (end-of-call outcome) +
 * completion screen. The dialer is launched from inside the workspace: the
 * page NEVER navigates away to call, so the questionnaire is exactly where
 * the agent left it when they come back from the native phone dialer.
 */

interface Props {
  interviewId: string;
  appel: { id: string; attemptNumber: number; statut: string };
  repondant: { nom: string | null; telephone: string; reference: string | null };
  enquete: { titre: string; versionNumber: number };
  questionnaire: DonneesQuestionnaire;
  reponsesInitiales: ReponsesParCle;
  dialer: DialerMeta;
}

type Phase = "entretien" | "disposition" | "termine";

type Resultat =
  | { type: "TERMINE"; signalements: number; dureeSecondes: number }
  | { type: "CLOTURE"; statut: string };

const CONSEQUENCES: Record<string, string> = {
  SANS_REPONSE: "Le répondant est retourné dans la file d'attente.",
  OCCUPE: "Le répondant est retourné dans la file d'attente.",
  ABANDONNE: "Le répondant est retourné dans la file d'attente.",
  RAPPEL: "Le rappel a été planifié.",
  REFUS: "Le répondant a été exclu de la campagne.",
  NUMERO_INCORRECT: "Le répondant a été exclu de la campagne.",
};

export function EspaceEntretien({
  interviewId,
  appel,
  repondant,
  enquete,
  questionnaire,
  reponsesInitiales,
  dialer,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("entretien");
  const [reponsesValidees, setReponsesValidees] = useState<ReponsesParCle | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [fileVide, setFileVide] = useState(false);
  const [chargementSuivant, setChargementSuivant] = useState(false);
  const [envoi, setEnvoi] = useState<string | null>(null);

  // Dialer state (honest: interface-level only).
  const [etatAppel, setEtatAppel] = useState<EtatAppel>("pret");
  const [messageAppel, setMessageAppel] = useState<string | null>(null);
  const [debutAppel, setDebutAppel] = useState<number | null>(null);
  const [secondes, setSecondes] = useState(0);
  const [appelVerrouilleUI, setAppelVerrouilleUI] = useState(false);
  const verrouAppel = useRef(false);
  const minuteurRepos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verrouCloture = useRef(false);

  // Restore the dialer launch after an app switch (native dialer on mobile).
  // The launch DID happen — restoring it is honest, the timer is labeled as
  // an interface chronometer, never as a verified cellular state.
  useEffect(() => {
    try {
      const brut = sessionStorage.getItem(`united:appel:${interviewId}`);
      if (brut) {
        const t = Number(brut);
        if (Number.isFinite(t) && t > 0) {
          // Intentional client-only hydration after mount: restoring the
          // dialer launch state survives the native-dialer app switch.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setEtatAppel("lance");
          setDebutAppel(t);
          setMessageAppel(
            "Composition déjà lancée depuis cet espace. Si rien ne se passe, composez le numéro affiché.",
          );
        }
      }
    } catch {
      /* storage unavailable — ignore */
    }
  }, [interviewId]);

  useEffect(() => {
    if (debutAppel === null) return;
    const t = setInterval(() => setSecondes(Math.floor((Date.now() - debutAppel) / 1000)), 1000);
    return () => clearInterval(t);
  }, [debutAppel]);

  // Clear the post-dial cooldown timer on unmount (never touch state after
  // the workspace is gone).
  useEffect(() => {
    return () => {
      if (minuteurRepos.current) clearTimeout(minuteurRepos.current);
    };
  }, []);

  // Leave guard: leaving must never abandon — a reload/close prompt protects
  // against losing the workspace context; the interview stays resumable.
  useEffect(() => {
    if (phase === "termine") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  function nettoyerStockageLocal() {
    try {
      localStorage.removeItem(`united:entretien:${interviewId}`);
      sessionStorage.removeItem(`united:appel:${interviewId}`);
    } catch {
      /* ignore */
    }
  }

  async function appeler() {
    if (verrouAppel.current) return;
    verrouAppel.current = true;
    setAppelVerrouilleUI(true);
    const resultatDialer = await initierAppel({
      dialer,
      numero: repondant.telephone,
      callAttemptId: appel.id,
    });
    verrouAppel.current = false;
    if (resultatDialer.statut === "INITIE") {
      const t = Date.now();
      setEtatAppel("lance");
      setDebutAppel(t);
      setSecondes(0);
      setMessageAppel(
        resultatDialer.message ??
          "Composition lancée. Si rien ne se passe, composez le numéro affiché.",
      );
      try {
        sessionStorage.setItem(`united:appel:${interviewId}`, String(t));
      } catch {
        /* ignore */
      }
      // Short cooldown against accidental double invocation of the OS dialer
      // (double-clicks cannot create duplicate CallAttempts — dialing is
      // purely client-side and the attempt already exists — this only protects
      // against double protocol hand-off). The button restores itself;
      // re-dialing stays possible afterwards.
      if (minuteurRepos.current) clearTimeout(minuteurRepos.current);
      minuteurRepos.current = setTimeout(() => setAppelVerrouilleUI(false), 3_000);
    } else {
      // Failure: immediate retry is allowed.
      setAppelVerrouilleUI(false);
      setEtatAppel("non_pris_en_charge");
      setMessageAppel(
        resultatDialer.message ??
          "Composition non prise en charge par cet appareil — composez manuellement le numéro affiché.",
      );
    }
  }

  function surQuestionnaireValide(reponses: ReponsesParCle) {
    setReponsesValidees(reponses);
    setPhase("disposition");
  }

  async function terminerEntretien(notes: string) {
    if (!reponsesValidees || verrouCloture.current) return;
    verrouCloture.current = true;
    setEnvoi("TERMINE");
    const r = await actionSoumettreEntretien({
      interviewId,
      reponses: reponsesValidees,
      notesAppel: notes || undefined,
    });
    setEnvoi(null);
    verrouCloture.current = false;
    if (r.succes && r.data) {
      nettoyerStockageLocal();
      setResultat({
        type: "TERMINE",
        signalements: r.data.signalements,
        dureeSecondes: r.data.dureeSecondes,
      });
      setPhase("termine");
      router.refresh();
    } else {
      toast({ title: "Erreur", description: r.message, variant: "destructive" });
    }
  }

  async function cloturer(
    statut: string,
    donnees: { notes: string; rappelDate?: string; rappelHeure?: string },
  ) {
    if (verrouCloture.current) return;
    verrouCloture.current = true;
    setEnvoi(statut);
    const r = await actionCloturerSansEntretien({
      interviewId,
      statut,
      notes: donnees.notes || undefined,
      rappelDate: donnees.rappelDate,
      rappelHeure: donnees.rappelHeure,
    });
    setEnvoi(null);
    verrouCloture.current = false;
    if (r.succes) {
      nettoyerStockageLocal();
      setResultat({ type: "CLOTURE", statut });
      setPhase("termine");
      router.refresh();
    } else {
      toast({ title: "Erreur", description: r.message, variant: "destructive" });
    }
  }

  async function repondantSuivant() {
    if (chargementSuivant) return;
    setChargementSuivant(true);
    setFileVide(false);
    const r = await actionAppelerSuivant();
    setChargementSuivant(false);
    if (!r.succes || !r.data) {
      toast({ title: "Erreur", description: r.message ?? "Action impossible.", variant: "destructive" });
      return;
    }
    if ("fileVide" in r.data) {
      setFileVide(true);
      return;
    }
    router.push(`/session/entretien/${r.data.interviewId}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Top row: guarded exit + wrap-up shortcut */}
      {phase !== "termine" && (
        <div className="flex items-center justify-between gap-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-slate-900"
              >
                ← Retour à la session
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Quitter cet entretien ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Votre progression enregistrée sera conservée. L&apos;entretien restera disponible
                  pour être repris depuis votre session.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Link href="/session">Quitter</Link>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {phase === "entretien" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setPhase("disposition")}
            >
              Clôturer l&apos;appel…
            </Button>
          )}
        </div>
      )}

      <EnteteRepondant
        repondant={repondant}
        tentative={appel.attemptNumber}
        enquete={enquete}
        etatAppel={etatAppel}
        messageAppel={messageAppel}
        secondesAppel={etatAppel === "lance" ? secondes : null}
        appelVerrouille={appelVerrouilleUI}
        surAppeler={appeler}
      />

      {phase === "entretien" && (
        <InterviewRunner
          mode="entretien"
          interviewId={interviewId}
          questionnaire={questionnaire}
          reponsesInitiales={reponsesInitiales}
          afficherTitre={false}
          onQuestionnaireValide={surQuestionnaireValide}
        />
      )}

      {/* Enabled only after the actual questionnaire handoff — a panel opened
          mid-interview can never submit an incomplete political interview. */}
      {phase === "disposition" && (
        <PanneauDisposition
          questionnaireComplet={reponsesValidees !== null}
          envoi={envoi}
          onTerminerEntretien={terminerEntretien}
          onCloturer={cloturer}
          onRevenirQuestionnaire={() => setPhase("entretien")}
        />
      )}

      {phase === "termine" && resultat && (
        <Card
          className={cn(
            resultat.type === "TERMINE" ? "border-emerald-200" : "border-slate-200",
          )}
        >
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            {resultat.type === "TERMINE" ? (
              <>
                <CircleCheck className="h-12 w-12 text-emerald-600" />
                <div>
                  <p className="text-lg font-semibold text-slate-900">Entretien enregistré</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Le questionnaire a été enregistré avec succès.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Durée : {Math.floor(resultat.dureeSecondes / 60)} min {resultat.dureeSecondes % 60} s
                  </p>
                </div>
                {resultat.signalements > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-left text-amber-900">
                    <TriangleAlert className="h-4 w-4" />
                    <AlertDescription>
                      Un contrôle qualité routinier a été déclenché sur cet entretien. Un superviseur
                      pourra l&apos;examiner — vos réponses sont conservées.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <>
                <CircleCheck className="h-10 w-10 text-slate-400" />
                <div>
                  <p className="text-lg font-semibold text-slate-900">Appel clôturé</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {CONSEQUENCES[resultat.statut] ?? "Le résultat de l'appel a été enregistré."}
                  </p>
                </div>
              </>
            )}

            {fileVide ? (
              <div className="w-full max-w-sm rounded-lg border border-dashed border-slate-300 px-4 py-5">
                <p className="text-sm font-medium text-slate-900">File d&apos;attente vide</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Aucun répondant disponible pour le moment.
                </p>
                <Button
                  variant="outline"
                  className="mt-3 gap-2"
                  onClick={repondantSuivant}
                  disabled={chargementSuivant}
                >
                  <RefreshCw className="h-4 w-4" /> Actualiser
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                className="h-12 gap-2 text-base"
                onClick={repondantSuivant}
                disabled={chargementSuivant}
              >
                {chargementSuivant ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <PhoneCall className="h-5 w-5" />
                )}
                Répondant suivant
              </Button>
            )}

            <Link href="/session" className="text-xs text-muted-foreground hover:text-slate-900">
              Retour à la session
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
