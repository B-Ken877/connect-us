"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { LoaderCircle, ChevronLeft, ChevronRight, CircleCheck, TriangleAlert, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ControleReponse } from "@/components/app/controle-reponse";
import {
  calculerProgression,
  premiereQuestionNonRepondue,
  questionPrecedente,
  questionSuivante,
  questionsVisibles,
  validerReponse,
  validerQuestionnaire,
} from "@/lib/survey-engine";
import type { ConfigurationVersion, QuestionDef, ReponsesParCle, ValeurReponse } from "@/lib/survey-engine";
import { actionEnregistrerReponse, actionSoumettreEntretien, actionAbandonnerEntretien } from "@/server/actions/agent-actions";

export interface DonneesQuestionnaire {
  titreEnquete: string;
  versionNumber: number;
  questions: QuestionDef[];
  configuration: ConfigurationVersion | null;
}

interface Props {
  mode: "entretien" | "apercu";
  interviewId?: string;
  questionnaire: DonneesQuestionnaire;
  contexte?: { idRepondant: string; nom: string | null; tentative?: number };
  reponsesInitiales?: ReponsesParCle;
}

/**
 * INTERVIEW RUNNER — one engine for the live agent interview AND the manager
 * preview. Branching visibility, per-answer autosave (debounced + on
 * navigation), full client validation mirrored server-side at submission.
 * Server DB remains the single source of truth; localStorage is only a
 * UX-resilience mirror.
 */
export function InterviewRunner({ mode, interviewId, questionnaire, contexte, reponsesInitiales }: Props) {
  const router = useRouter();
  const { questions, titreEnquete, versionNumber, configuration } = questionnaire;

  const [reponses, setReponses] = useState<ReponsesParCle>(reponsesInitiales ?? {});
  const [cleChoisie, setCleChoisie] = useState<string | null>(null); // position explicite (navigation)
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [sauvegarde, setSauvegarde] = useState<"repos" | "en_cours" | "ok" | "erreur">("repos");
  const [soumission, setSoumission] = useState(false);
  const [termine, setTermine] = useState<{ signalements: number; dureeSecondes: number } | null>(null);
  const [apercuTermine, setApercuTermine] = useState(false);

  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending answers queue (key → value): ref-based, immune to stale closures.
  const enAttente = useRef<Map<string, ValeurReponse>>(new Map());

  const visibles = useMemo(() => questionsVisibles(questions, reponses), [questions, reponses]);

  // Current question — DERIVED during render (no effect): if the chosen key is
  // still visible we keep it, otherwise we resume at the first unanswered
  // visible question (handles initial load AND branch changes).
  const cleCourante = useMemo(() => {
    if (cleChoisie && visibles.some((q) => q.key === cleChoisie)) return cleChoisie;
    return premiereQuestionNonRepondue(questions, reponses)?.key ?? visibles[0]?.key ?? null;
  }, [cleChoisie, visibles, questions, reponses]);

  // localStorage mirror (UX resilience only — server is authoritative).
  const cleLocale = interviewId ? `gig:entretien:${interviewId}` : null;
  const [hydratationFaite, setHydratationFaite] = useState(false);
  useEffect(() => {
    if (!cleLocale || mode !== "entretien" || hydratationFaite) return;
    try {
      const brut = localStorage.getItem(cleLocale);
      if (brut) {
        const local = JSON.parse(brut) as ReponsesParCle;
        // Intentional client-only hydration of the resilience mirror after mount.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setReponses((prec) => {
          const fusion: ReponsesParCle = {};
          for (const [k, v] of Object.entries(local)) if (v) fusion[k] = v;
          for (const [k, v] of Object.entries(prec)) if (v) fusion[k] = v;
          return fusion;
        });
      }
    } catch {
      /* ignore corrupted local state */
    }
    setHydratationFaite(true);
  }, [cleLocale, mode, hydratationFaite]);

  useEffect(() => {
    if (cleLocale && mode === "entretien") {
      try {
        localStorage.setItem(cleLocale, JSON.stringify(reponses));
      } catch {
        /* storage full/unavailable — non-blocking */
      }
    }
  }, [reponses, cleLocale, mode]);

  const sauvegarderMaintenant = useCallback(async () => {
    if (mode !== "entretien" || !interviewId) return;
    const lots = Array.from(enAttente.current.entries());
    if (lots.length === 0) return;
    enAttente.current.clear();
    setSauvegarde("en_cours");
    const resultats = await Promise.all(
      lots.map(([cle, valeur]) =>
        actionEnregistrerReponse({ interviewId, questionKey: cle, valeur }).catch(() => ({ succes: false as const })),
      ),
    );
    const echec = resultats.some((r) => !r.succes);
    setSauvegarde(echec ? "erreur" : "ok");
  }, [interviewId, mode]);

  function majReponse(cle: string, valeur: Parameters<typeof validerReponse>[1]) {
    const valeurPropre = valeur ?? {};
    setReponses((prec) => {
      const suivant: ReponsesParCle = { ...prec };
      suivant[cle] = valeurPropre;
      return suivant;
    });
    setErreurs((prec) => {
      if (!prec[cle]) return prec;
      const copie = { ...prec };
      delete copie[cle];
      return copie;
    });
    enAttente.current.set(cle, valeurPropre);
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      void sauvegarderMaintenant();
    }, 700);
  }

  const question = questions.find((q) => q.key === cleCourante) ?? null;
  const progression = cleCourante
    ? calculerProgression(questions, reponses, cleCourante)
    : { index: 0, total: visibles.length, repondues: 0, termine: false };
  const estDerniere = cleCourante ? visibles[visibles.length - 1]?.key === cleCourante : false;

  function naviger(direction: "avant" | "arriere") {
    if (!cleCourante) return;
    if (direction === "avant") {
      const questionCourante = questions.find((q) => q.key === cleCourante);
      if (questionCourante) {
        const erreur = validerReponse(questionCourante, reponses[cleCourante]);
        if (erreur) {
          setErreurs((p) => ({ ...p, [cleCourante]: erreur }));
          return;
        }
      }
      const suivante = questionSuivante(questions, reponses, cleCourante);
      if (suivante) {
        void sauvegarderMaintenant();
        setCleChoisie(suivante.key);
      }
    } else {
      const precedente = questionPrecedente(questions, reponses, cleCourante);
      if (precedente) {
        void sauvegarderMaintenant();
        setCleChoisie(precedente.key);
      }
    }
  }

  async function terminer() {
    const toutesErreurs = validerQuestionnaire(questions, reponses, visibles);
    if (Object.keys(toutesErreurs).length > 0) {
      setErreurs(toutesErreurs);
      const premiere = visibles.find((q) => toutesErreurs[q.key]);
      if (premiere) setCleChoisie(premiere.key);
      toast({
        title: "Réponses incomplètes",
        description: "Certaines questions obligatoires nécessitent une réponse.",
        variant: "destructive",
      });
      return;
    }

    if (mode === "apercu") {
      setApercuTermine(true);
      return;
    }

    if (!interviewId) return;
    setSoumission(true);
    const r = await actionSoumettreEntretien({ interviewId, reponses });
    setSoumission(false);
    if (r.succes && r.data) {
      try {
        localStorage.removeItem(`gig:entretien:${interviewId}`);
      } catch {
        /* ignore */
      }
      setTermine(r.data);
      router.refresh();
    } else {
      toast({ title: "Erreur", description: r.message, variant: "destructive" });
    }
  }

  async function abandonner() {
    if (!interviewId) return;
    const r = await actionAbandonnerEntretien(interviewId);
    if (r.succes) {
      try {
        localStorage.removeItem(`gig:entretien:${interviewId}`);
      } catch {
        /* ignore */
      }
      router.push("/session");
    } else {
      toast({ title: "Erreur", description: r.message, variant: "destructive" });
    }
  }

  // ------------------------------------------------------------------ rendu

  if (termine) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="border-emerald-200">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CircleCheck className="h-12 w-12 text-emerald-600" />
            <div>
              <p className="text-lg font-semibold text-slate-900">Entretien enregistré</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Durée : {Math.floor(termine.dureeSecondes / 60)} min {termine.dureeSecondes % 60} s ·
                {" "}
                {progression.total} questions visibles
              </p>
              {termine.signalements > 0 && (
                <Alert className="mt-4 border-amber-200 bg-amber-50 text-left text-amber-900">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertDescription>
                    {termine.signalements} contrôle(s) qualité automatique(s) ont été générés. Un
                    superviseur examinera cet entretien — vos réponses sont conservées.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <Button size="lg" className="gap-2" onClick={() => router.push("/session")}>
              Répondant suivant
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (apercuTermine) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="border-teal-200">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CircleCheck className="h-12 w-12 text-teal-700" />
            <div>
              <p className="text-lg font-semibold text-slate-900">Aperçu terminé</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Le questionnaire est complet et toutes les réponses respectent la validation et la
                logique conditionnelle. Aucune donnée n&apos;a été enregistrée.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setApercuTermine(false);
                setReponses({});
                setErreurs({});
              }}
            >
              Relancer l&apos;aperçu
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">{titreEnquete}</p>
          <p className="text-xs text-muted-foreground">Version {versionNumber}</p>
        </div>
        <div className="flex items-center gap-3">
          {mode === "apercu" && (
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <Eye className="h-3.5 w-3.5" /> Aperçu
            </span>
          )}
          {mode === "entretien" && (
            <span
              className={
                sauvegarde === "erreur"
                  ? "text-xs font-medium text-red-600"
                  : sauvegarde === "en_cours"
                    ? "text-xs text-muted-foreground"
                    : "text-xs text-emerald-600"
              }
              aria-live="polite"
            >
              {sauvegarde === "en_cours" && "Enregistrement…"}
              {sauvegarde === "ok" && "Réponses enregistrées ✓"}
              {sauvegarde === "erreur" && "Échec d'enregistrement — nouvelle tentative à la navigation"}
              {sauvegarde === "repos" && ""}
            </span>
          )}
        </div>
      </div>

      {contexte && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="text-muted-foreground">Répondant :</span>{" "}
          <span className="font-medium">{contexte.nom ?? "Répondant"}</span>{" "}
          <span className="font-mono text-xs text-muted-foreground">({contexte.idRepondant.slice(-8)})</span>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Question {progression.index} sur {progression.total}
          </span>
          <span>{progression.repondues} / {progression.total} répondues</span>
        </div>
        <Progress value={progression.total ? (progression.index / progression.total) * 100 : 0} />
      </div>

      {question && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-base font-medium leading-relaxed text-slate-900">
                {question.text}
                {question.required && <span className="ml-1 text-red-600">*</span>}
              </p>
              {question.helpText && (
                <p className="mt-1 text-sm text-muted-foreground">{question.helpText}</p>
              )}
            </div>

            <ControleReponse
              question={question}
              valeur={reponses[question.key]}
              onChange={(valeur) => majReponse(question.key, valeur)}
              desactive={soumission}
            />

            {erreurs[question.key] && (
              <p className="text-sm font-medium text-red-600" role="alert">
                {erreurs[question.key]}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => naviger("arriere")}
          disabled={!questionPrecedente(questions, reponses, cleCourante ?? "")}
          className="min-w-28"
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
        </Button>

        <div className="flex items-center gap-2">
          {mode === "entretien" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-muted-foreground">
                  Abandonner
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Abandonner cet entretien ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Les réponses déjà saisies pour cet entretien seront marquées comme abandonnées.
                    Le répondant retournera dans la file d&apos;attente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Continuer l&apos;entretien</AlertDialogCancel>
                  <AlertDialogAction onClick={abandonner} className="bg-red-600 hover:bg-red-700">
                    Abandonner l&apos;entretien
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {!estDerniere ? (
            <Button onClick={() => naviger("avant")} className="min-w-28">
              Suivant <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={terminer} disabled={soumission} size="lg" className="gap-2">
              {soumission && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Terminer l&apos;entretien
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
