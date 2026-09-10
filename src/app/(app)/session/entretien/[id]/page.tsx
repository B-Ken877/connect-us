import { redirect } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { depuisColonnes, type QuestionDef } from "@/lib/survey-engine";
import { obtenirDialerMeta } from "@/lib/dialer/registry";
import { EspaceEntretien } from "@/components/app/espace-entretien";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entretien en cours — GIG Survey" };

/**
 * INTERVIEW WORKSPACE PAGE — strict server-side authorization:
 * authenticated agent role + interview ownership (an agent can never open
 * another agent's interview by changing the URL). The questionnaire served is
 * the one pinned to the interview's SurveyVersion — never "latest published".
 */
export default async function PageEntretien({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await exigerAcces(["AGENT", "ADMINISTRATEUR"]);

  const entretien = await db.interview.findUnique({
    where: { id },
    include: {
      respondent: { select: { id: true, name: true, phone: true, externalRef: true } },
      callAttempt: { select: { id: true, attemptNumber: true, status: true } },
    },
  });
  if (!entretien) redirect("/session");
  if (entretien.agentId !== session.sub) {
    throw new AppError("ACCES_REFUSE", "Cet entretien n'est pas assigné à votre session.");
  }
  if (entretien.status !== "EN_COURS") redirect("/session");

  // The interview's own SurveyVersion is the single source of truth (§4):
  // a manager publishing a new version later never mutates this interview.
  const version = await db.surveyVersion.findUnique({
    where: { id: entretien.surveyVersionId },
    include: {
      survey: { select: { title: true } },
      questions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
    },
  });
  if (!version) {
    throw new AppError("ETAT_INVALIDE", "La version d'enquête associée à cet entretien est introuvable.");
  }

  const reponsesEnBases = await db.answer.findMany({ where: { interviewId: entretien.id } });
  const reponsesInitiales: Record<string, unknown> = {};
  for (const ligne of reponsesEnBases) {
    reponsesInitiales[ligne.questionKey] = depuisColonnes(ligne);
  }

  const questions = version.questions as unknown as QuestionDef[];
  if (!entretien.callAttempt) {
    throw new AppError("ETAT_INVALIDE", "Aucun appel n'est associé à cet entretien.");
  }

  return (
    <EspaceEntretien
      interviewId={entretien.id}
      appel={{
        id: entretien.callAttempt.id,
        attemptNumber: entretien.callAttempt.attemptNumber,
        statut: entretien.callAttempt.status,
      }}
      repondant={{
        nom: entretien.respondent.name,
        telephone: entretien.respondent.phone,
        reference: entretien.respondent.externalRef,
      }}
      enquete={{ titre: version.survey.title, versionNumber: version.versionNumber }}
      questionnaire={{
        titreEnquete: version.survey.title,
        versionNumber: version.versionNumber,
        questions,
        configuration: (version.config ?? null) as never,
      }}
      reponsesInitiales={reponsesInitiales as never}
      dialer={obtenirDialerMeta()}
    />
  );
}
