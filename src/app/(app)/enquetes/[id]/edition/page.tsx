import { notFound, redirect } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { obtenirEnquete, obtenirVersion } from "@/server/services/survey-service";
import { EditeurQuestions } from "@/components/app/editeur-questions";
import type { QuestionDef } from "@/lib/survey-engine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Édition de l'enquête — UNITED Research" };

export default async function PageEditionEnquete({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigerAcces(["ADMINISTRATEUR"]);

  let enquete;
  try {
    enquete = await obtenirEnquete(id);
  } catch {
    notFound();
  }

  const brouillon = enquete.versions.find((v) => v.status === "BROUILLON");
  if (!brouillon) {
    // No draft: the detail page offers "Nouvelle version".
    redirect(`/enquetes/${id}`);
  }

  const version = await obtenirVersion(brouillon.id);
  const questions = version.questions as unknown as QuestionDef[];

  return (
    <EditeurQuestions
      enqueteId={enquete.id}
      version={{ id: version.id, versionNumber: version.versionNumber, status: version.status }}
      questions={questions}
    />
  );
}
