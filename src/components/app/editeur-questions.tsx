"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Plus,
  ArrowUp,
  ArrowDown,
  PencilLine,
  Copy,
  Trash2,
  Eye,
  LoaderCircle,
  GitBranch,
  Lock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EditeurQuestionDialog, type DonneesFormulaireQuestion } from "@/components/app/editeur-question-dialog";
import { LIBELLES_TYPE_QUESTION, type QuestionDef } from "@/lib/survey-engine/types";
import {
  actionCreerQuestion,
  actionMajQuestion,
  actionSupprimerQuestion,
  actionDupliquerQuestion,
  actionReordonnerQuestions,
} from "@/server/actions/survey-actions";

interface Props {
  enqueteId: string;
  version: { id: string; versionNumber: number; status: string };
  questions: QuestionDef[];
}

/** Survey builder: add / edit / duplicate / delete / reorder questions. */
export function EditeurQuestions({ enqueteId, version, questions: questionsInitiales }: Props) {
  const [questions, setQuestions] = useState<QuestionDef[]>(questionsInitiales);
  const [dialogueOuvert, setDialogueOuvert] = useState(false);
  const [questionEnEdition, setQuestionEnEdition] = useState<QuestionDef | null>(null);
  const [enCours, demarrer] = useTransition();
  const publiable = questions.length > 0;

  const questionsPrecedentes = useMemo(
    () => questions.map((q) => ({ key: q.key, text: q.text })),
    [questions],
  );

  function rafraichirDepuisServeur() {
    demarrer(async () => {
      // Reload server state (single source of truth).
      window.location.reload();
    });
  }

  async function enregistrerQuestion(donnees: DonneesFormulaireQuestion) {
    if (questionEnEdition) {
      const r = await actionMajQuestion(questionEnEdition.id, donnees);
      if (!r.succes) throw new Error(r.message);
      toast({ title: "Question modifiée" });
    } else {
      const r = await actionCreerQuestion(version.id, donnees);
      if (!r.succes) throw new Error(r.message);
      toast({ title: "Question ajoutée" });
    }
    rafraichirDepuisServeur();
  }

  function deplacer(index: number, direction: -1 | 1) {
    const cible = index + direction;
    if (cible < 0 || cible >= questions.length) return;
    const copie = [...questions];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    setQuestions(copie);
    demarrer(async () => {
      const r = await actionReordonnerQuestions(version.id, copie.map((q) => q.id));
      if (!r.succes) toast({ title: "Réordre impossible", description: r.message, variant: "destructive" });
    });
  }

  function dupliquer(question: QuestionDef) {
    demarrer(async () => {
      const r = await actionDupliquerQuestion(question.id);
      if (r.succes) {
        toast({ title: "Question dupliquée" });
        rafraichirDepuisServeur();
      } else {
        toast({ title: "Duplication impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  function supprimer(question: QuestionDef) {
    demarrer(async () => {
      const r = await actionSupprimerQuestion(question.id);
      if (r.succes) {
        toast({ title: "Question supprimée" });
        rafraichirDepuisServeur();
      } else {
        toast({ title: "Suppression impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  const brouillonVerrouille = version.status !== "BROUILLON";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Édition — version {version.versionNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {brouillonVerrouille ? (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <Lock className="h-3.5 w-3.5" /> Version publiée : lecture seule (immuable).
              </span>
            ) : (
              "Ajoutez et organisez les questions du questionnaire."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/enquetes/${enqueteId}/apercu?version=${version.id}`}>
              <Eye className="h-4 w-4" /> Aperçu
            </Link>
          </Button>
          <Button
            className="gap-2"
            onClick={() => {
              setQuestionEnEdition(null);
              setDialogueOuvert(true);
            }}
            disabled={brouillonVerrouille}
          >
            <Plus className="h-4 w-4" /> Ajouter une question
          </Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm font-medium text-slate-900">Aucune question dans cette version</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Commencez par une question d&apos;âge ou de profil, puis construisez les questions
              conditionnelles qui en dépendent.
            </p>
            <Button
              className="gap-2"
              onClick={() => {
                setQuestionEnEdition(null);
                setDialogueOuvert(true);
              }}
              disabled={brouillonVerrouille}
            >
              <Plus className="h-4 w-4" /> Ajouter la première question
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {questions.map((question, index) => (
            <Card key={question.id} className="border-slate-200">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex flex-col items-center gap-0.5 pt-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deplacer(index, -1)} disabled={index === 0 || brouillonVerrouille || enCours} aria-label="Monter">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <span className="chiffre-cle text-xs font-semibold text-slate-500">{index + 1}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deplacer(index, 1)} disabled={index === questions.length - 1 || brouillonVerrouille || enCours} aria-label="Descendre">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium leading-snug text-slate-900">{question.text}</p>
                    {question.required && <Badge variant="outline" className="border-red-200 bg-red-50 text-xs text-red-700">Obligatoire</Badge>}
                    {question.conditionalLogic && (
                      <Badge variant="outline" className="border-teal-200 bg-teal-50 text-xs text-teal-700">
                        <GitBranch className="mr-1 h-3 w-3" /> Conditionnelle
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">{question.key}</span>
                    <span>·</span>
                    <span>{LIBELLES_TYPE_QUESTION[question.type]}</span>
                    {question.options.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{question.options.length} option(s)</span>
                      </>
                    )}
                  </p>
                  {question.conditionalLogic && (
                    <p className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      {question.conditionalLogic.conditions
                        .map((c) => `Q(${c.questionKey}) ${c.operateur.replace("_", " ").toLowerCase()}${c.valeur !== undefined ? ` « ${c.valeur} »` : ""}`)
                        .join(question.conditionalLogic.operateurLogique === "OU" ? " OU " : " ET ")}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setQuestionEnEdition(question);
                      setDialogueOuvert(true);
                    }}
                    disabled={brouillonVerrouille}
                    aria-label="Modifier"
                  >
                    <PencilLine className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => dupliquer(question)} disabled={brouillonVerrouille || enCours} aria-label="Dupliquer">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={brouillonVerrouille} aria-label="Supprimer">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette question ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          « {question.text.slice(0, 80)} » sera retirée du brouillon. Les règles
                          conditionnelles qui la référencent devront être ajustées.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => supprimer(question)} className="bg-red-600 hover:bg-red-700">
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {enCours && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="h-3 w-3 animate-spin" /> Synchronisation…
        </p>
      )}

      <EditeurQuestionDialog
        ouvert={dialogueOuvert}
        onFermer={() => {
          setDialogueOuvert(false);
          setQuestionEnEdition(null);
        }}
        onEnregistrer={enregistrerQuestion}
        questionInitiale={questionEnEdition}
        questionsPrecedentes={questionsPrecedentes.filter((q) => q.key !== questionEnEdition?.key)}
        clesExistantes={questions.map((q) => q.key)}
      />
    </div>
  );
}
