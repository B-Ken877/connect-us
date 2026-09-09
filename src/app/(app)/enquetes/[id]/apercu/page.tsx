import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { obtenirVersion } from "@/server/services/survey-service";
import { InterviewRunner } from "@/components/app/interview-runner";
import type { QuestionDef } from "@/lib/survey-engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aperçu de l'enquête — GIG Survey" };

/**
 * Survey preview — executes the REAL engine (ordering, required, validation,
 * branching, options) exactly like the agent will see it, without creating
 * any respondent or interview data.
 */
export default async function PageApercu({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id } = await params;
  const { version: versionId } = await searchParams;
  await exigerAcces(["ADMINISTRATEUR", "GESTIONNAIRE"]);

  let version;
  try {
    version = await obtenirVersion(versionId ?? "");
  } catch {
    notFound();
  }
  if (version.survey.id !== id) notFound();

  const questions = version.questions as unknown as QuestionDef[];

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-2xl">
        <Link href={`/enquetes/${id}`} className="text-sm text-muted-foreground hover:text-slate-900">
          ← Retour à l&apos;enquête
        </Link>
      </div>
      <InterviewRunner
        mode="apercu"
        questionnaire={{
          titreEnquete: version.survey.title,
          versionNumber: version.versionNumber,
          questions,
          configuration: (version.config ?? null) as never,
        }}
      />
    </div>
  );
}
