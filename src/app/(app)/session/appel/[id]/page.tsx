import { redirect } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { obtenirDialerMeta } from "@/lib/dialer/registry";
import { EcranAppel } from "@/components/app/ecran-appel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appel en cours — GIG Survey" };

/**
 * LEGACY CALL SCREEN — compatibility layer.
 * The normal workflow no longer passes here: the queue creates the interview
 * at assignment and the agent lands directly in /session/entretien/[id].
 * This route remains for in-flight data created before the refactor: whenever
 * a live interview exists for the call, the agent is transparently funneled
 * into the interview workspace.
 */
export default async function PageAppel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await exigerAcces(["AGENT", "ADMINISTRATEUR"]);

  const appel = await db.callAttempt.findUnique({
    where: { id },
    include: {
      respondent: {
        select: {
          id: true,
          name: true,
          phone: true,
          externalRef: true,
          callAttempts: { select: { id: true } },
        },
      },
    },
  });
  if (!appel) redirect("/session");
  if (appel.agentId !== session.sub) {
    throw new AppError("ACCES_REFUSE", "Cet appel n'est pas attribué à votre session.");
  }

  // Live interview attached to this call → the interview workspace IS the
  // destination, whatever the call status.
  const entretienExistante = await db.interview.findUnique({ where: { callAttemptId: appel.id } });
  if (entretienExistante && entretienExistante.status === "EN_COURS") {
    redirect(`/session/entretien/${entretienExistante.id}`);
  }

  if (appel.status !== "EN_COURS") {
    // Closed call without a live interview: back to the queue.
    redirect("/session");
  }

  const derniereVersionPubliee = await db.surveyVersion.findFirst({
    where: { status: "PUBLIEE" },
    orderBy: { publishedAt: "desc" },
    include: { survey: { select: { title: true } } },
  });

  return (
    <EcranAppel
      appel={{
        id: appel.id,
        startedAt: appel.startedAt.toISOString(),
        attemptNumber: appel.attemptNumber,
      }}
      repondant={{
        id: appel.respondent.id,
        nom: appel.respondent.name,
        telephone: appel.respondent.phone,
        reference: appel.respondent.externalRef,
        nbTentatives: appel.respondent.callAttempts.length,
      }}
      enqueteActive={
        derniereVersionPubliee
          ? { titre: derniereVersionPubliee.survey.title, versionNumber: derniereVersionPubliee.versionNumber }
          : null
      }
      dialer={obtenirDialerMeta()}
    />
  );
}
