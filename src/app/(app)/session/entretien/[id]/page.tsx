import { redirect } from "next/navigation";
import Link from "next/link";
import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { depuisColonnes, type QuestionDef } from "@/lib/survey-engine";
import { InterviewRunner } from "@/components/app/interview-runner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entretien en cours — GIG Survey" };

/** Live interview — strict ownership check (concurrency + authorization). */
export default async function PageEntretien({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await exigerAcces(["AGENT", "ADMINISTRATEUR"]);

  const entretien = await db.interview.findUnique({
    where: { id },
    include: {
      respondent: { select: { id: true, name: true } },
      callAttempt: { select: { attemptNumber: true } },
    },
  });
  if (!entretien) redirect("/session");
  if (entretien.agentId !== session.sub) {
    throw new AppError("ACCES_REFUSE", "Cet entretien n'est pas assigné à votre session.");
  }
  if (entretien.status === "TERMINE") redirect("/session");

  const version = await db.surveyVersion.findUnique({
    where: { id: entretien.surveyVersionId },
    include: {
      survey: { select: { title: true } },
      questions: { include: { options: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } },
    },
  });
  if (!version || version.status !== "PUBLIEE") {
    throw new AppError("ETAT_INVALIDE", "La version d'enquête associée n'est plus disponible.");
  }

  const reponsesEnBases = await db.answer.findMany({ where: { interviewId: entretien.id } });
  const reponsesInitiales: Record<string, unknown> = {};
  for (const ligne of reponsesEnBases) {
    reponsesInitiales[ligne.questionKey] = depuisColonnes(ligne);
  }

  const questions = version.questions as unknown as QuestionDef[];

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-2xl">
        <Link href="/session" className="text-sm text-muted-foreground hover:text-slate-900">
          ← Retour à la session
        </Link>
      </div>
      <InterviewRunner
        mode="entretien"
        interviewId={entretien.id}
        questionnaire={{
          titreEnquete: version.survey.title,
          versionNumber: version.versionNumber,
          questions,
          configuration: (version.config ?? null) as never,
        }}
        contexte={{
          idRepondant: entretien.respondent.id,
          nom: entretien.respondent.name,
          tentative: entretien.callAttempt?.attemptNumber,
        }}
        reponsesInitiales={reponsesInitiales as never}
      />
    </div>
  );
}
