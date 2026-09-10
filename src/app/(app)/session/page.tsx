import { exigerAcces } from "@/lib/auth/session";
import { ConsoleAgent } from "@/components/app/console-agent";
import { statistiquesAgent } from "@/server/services/stats-service";
import { obtenirEntretienActif } from "@/server/services/interview-service";
import { db } from "@/lib/db";
import { obtenirDialerMeta } from "@/lib/dialer/registry";

export const metadata = { title: "Session d'appels — GIG Survey" };
export const dynamic = "force-dynamic";

/** Agent workspace — intentionally minimal: receive, call, interview, next. */
export default async function PageSession() {
  const session = await exigerAcces(["AGENT", "ADMINISTRATEUR"]);
  const [stats, entretienActif, versionActive] = await Promise.all([
    statistiquesAgent(session.sub),
    obtenirEntretienActif(session.sub),
    db.surveyVersion.findFirst({
      where: { status: "PUBLIEE" },
      orderBy: { publishedAt: "desc" },
      include: { survey: { select: { title: true } }, _count: { select: { questions: true } } },
    }),
  ]);

  const prenom = session.nom.split(" ")[0];

  return (
    <ConsoleAgent
      prenom={prenom}
      nomComplet={session.nom}
      statsInitiales={stats}
      entretienActif={
        entretienActif
          ? {
              interviewId: entretienActif.id,
              nom: entretienActif.respondent.name,
              telephone: entretienActif.respondent.phone,
            }
          : null
      }
      versionActive={
        versionActive
          ? {
              titre: versionActive.survey.title,
              versionNumber: versionActive.versionNumber,
              nbQuestions: versionActive._count.questions,
            }
          : null
      }
      dialer={obtenirDialerMeta()}
    />
  );
}
