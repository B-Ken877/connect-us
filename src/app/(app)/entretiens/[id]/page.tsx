import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { obtenirDetailEntretien } from "@/server/services/interview-service";
import { EnTetePage } from "@/components/app/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  formatDateHeureFr,
  formatDuree,
  masquerTelephone,
  LIBELLES_STATUT_APPEL,
  LIBELLES_STATUT_ENTRETIEN,
  LIBELLES_STATUT_REPONDANT,
} from "@/lib/format";
import { LIBELLES_TYPE_QUESTION } from "@/lib/survey-engine/types";
import {
  ChevronLeft,
  Phone,
  User,
  Calendar,
  Clock,
  FileText,
  ShieldAlert,
  Ban,
  MessageSquare,
  ClipboardList,
} from "lucide-react";

export const metadata = { title: "Détail de l'appel — UNITED Research" };
export const dynamic = "force-dynamic";

/** Affiche la valeur canonique d'une réponse selon son type. */
function afficherValeurReponse(answer: {
  question: { type: string } | null;
  textValue: string | null;
  numberValue: number | null;
  dateValue: Date | null;
  boolValue: boolean | null;
  choiceValues: string[];
}): string {
  if (!answer.question) return "Question supprimée";
  switch (answer.question.type) {
    case "TEXTE_COURT":
    case "TEXTE_LONG":
      return answer.textValue?.trim() || "(aucune réponse)";
    case "NOMBRE":
      return answer.numberValue !== null ? String(answer.numberValue) : "(aucune réponse)";
    case "OUI_NON":
      if (answer.boolValue === null || answer.boolValue === undefined) return "(aucune réponse)";
      return answer.boolValue ? "Oui" : "Non";
    case "DATE":
      return answer.dateValue ? formatDateHeureFr(answer.dateValue) : "(aucune réponse)";
    case "CHOIX_UNIQUE":
      return answer.choiceValues[0] ?? "(aucune réponse)";
    case "CHOIX_MULTIPLE":
      return answer.choiceValues.length > 0 ? answer.choiceValues.join(", ") : "(aucune réponse)";
    case "ECHELLE":
      return answer.numberValue !== null ? `${answer.numberValue}/10` : "(aucune réponse)";
    case "LISTE_DEROULANTE":
      return answer.choiceValues[0] ?? "(aucune réponse)";
    default:
      return answer.textValue ?? "(réponse non lisible)";
  }
}

export default async function PageDetailEntretien({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await exigerAcces(["ADMINISTRATEUR"]);
  const { id } = await params;

  let entretien;
  try {
    entretien = await obtenirDetailEntretien(id);
  } catch {
    notFound();
  }

  const estOptOut = entretien.callAttempt?.status === "NE_PAS_RAPPELER"
    || entretien.respondent.status === "EXCLU";

  return (
    <div className="mx-auto max-w-4xl">
      {/* En-tête avec retour */}
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href="/entretiens">
            <ChevronLeft className="h-4 w-4" /> Retour à la liste
          </Link>
        </Button>
      </div>

      <EnTetePage
        titre={`Appel du ${formatDateHeureFr(entretien.startedAt)}`}
        description="Détail complet de l'appel — questions, réponses et métadonnées."
        actions={
          <Badge
            variant="outline"
            className={
              entretien.status === "TERMINE"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : entretien.status === "ABANDONNE"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-border bg-muted"
            }
          >
            {LIBELLES_STATUT_ENTRETIEN[entretien.status] ?? entretien.status}
          </Badge>
        }
      />

      {/* Alerte opt-out */}
      {estOptOut && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <Ban className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-900">Demande de ne plus appeler (opt-out)</p>
            <p className="text-xs text-red-700">
              Ce contact a demandé à ne plus être appelé. Il a été exclu de la file d'appels automatique.
            </p>
          </div>
        </div>
      )}

      {/* Métadonnées de l'appel */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-primary" /> Informations d'appel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Résultat de l'appel</span>
              <span className="font-medium">
                {entretien.callAttempt
                  ? LIBELLES_STATUT_APPEL[entretien.callAttempt.status] ?? entretien.callAttempt.status
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date de début</span>
              <span className="font-medium">{formatDateHeureFr(entretien.startedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date de fin</span>
              <span className="font-medium">{formatDateHeureFr(entretien.completedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durée</span>
              <span className="font-medium">
                {entretien.durationSeconds
                  ? formatDuree(entretien.durationSeconds)
                  : entretien.callAttempt?.durationSeconds
                    ? formatDuree(entretien.callAttempt.durationSeconds)
                    : "—"}
              </span>
            </div>
            {entretien.callAttempt?.callbackAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rappel planifié</span>
                <span className="font-medium">{formatDateHeureFr(entretien.callAttempt.callbackAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-primary" /> Agent et contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-medium">{entretien.agent.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contact</span>
              <span className="font-medium">{entretien.respondent.name ?? "Anonyme"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Téléphone (masqué)</span>
              <span className="font-mono text-xs">{masquerTelephone(entretien.respondent.phone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Statut contact</span>
              <Badge variant="outline" className="border-border bg-muted text-xs">
                {LIBELLES_STATUT_REPONDANT[entretien.respondent.status] ?? entretien.respondent.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Campagne</span>
              <span className="font-medium">{entretien.surveyVersion.survey.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version du questionnaire</span>
              <span className="font-medium">v{entretien.surveyVersion.versionNumber} (figée)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Script d'introduction utilisé */}
      {entretien.surveyVersion.survey.openingScript && (
        <Card className="mb-6 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" /> Script d'introduction utilisé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 rounded-md bg-muted/30 p-4">
              {entretien.surveyVersion.survey.openingScript.split("\n").map((ligne, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground">
                  {ligne || "\u00A0"}
                </p>
              ))}
            </div>
            {entretien.surveyVersion.survey.candidateName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Candidat : {entretien.surveyVersion.survey.candidateName}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes de l'agent */}
      {entretien.callAttempt?.notes && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-primary" /> Notes de l'agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {entretien.callAttempt.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Questions et réponses — la partie centrale */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" /> Questions et réponses
            <Badge variant="outline" className="ml-2 border-border bg-muted text-xs">
              {entretien.answers.length} réponse(s)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entretien.answers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune réponse enregistrée pour cet appel.
            </p>
          ) : (
            <div className="space-y-6">
              {entretien.answers.map((answer, index) => (
                <div key={answer.id}>
                  {index > 0 && <Separator className="mb-6" />}
                  {/* Question */}
                  <div className="mb-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="libelle-section">Question</span>
                      {answer.question?.required && (
                        <Badge variant="outline" className="border-red-200 bg-red-50 text-xs text-red-700">
                          Obligatoire
                        </Badge>
                      )}
                      {answer.question && (
                        <Badge variant="outline" className="border-border bg-muted text-xs">
                          {LIBELLES_TYPE_QUESTION[answer.question.type] ?? answer.question.type}
                        </Badge>
                      )}
                    </div>
                    <p className="pl-8 text-base font-medium leading-relaxed text-foreground">
                      {answer.question?.text ?? "(question supprimée)"}
                    </p>
                    {answer.question?.helpText && (
                      <p className="pl-8 mt-1 text-xs text-muted-foreground">
                        {answer.question.helpText}
                      </p>
                    )}
                  </div>
                  {/* Réponse */}
                  <div className="ml-8 rounded-lg border border-border bg-muted/20 p-4">
                    <p className="libelle-section mb-1.5">Réponse de l'agent</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {afficherValeurReponse(answer)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signalements qualité */}
      {entretien.qualityFlags.length > 0 && (
        <Card className="mb-6 border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Signalements qualité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entretien.qualityFlags.map((flag) => (
              <div key={flag.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-sm">
                <p className="font-medium text-amber-900">{flag.reason}</p>
                <p className="mt-1 text-xs text-amber-700">
                  Type : {flag.type} · Sévérité : {flag.severity} · Statut : {flag.status}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pied — info version figée */}
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>
          Questionnaire version {entretien.surveyVersion.versionNumber} (publiée le{" "}
          {formatDateHeureFr(entretien.surveyVersion.publishedAt)}) — les questions et réponses
          sont figées telles qu&apos;elles étaient au moment de l&apos;appel.
        </span>
      </div>
    </div>
  );
}
