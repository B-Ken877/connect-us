import { exigerAcces } from "@/lib/auth/session";
import { ConsoleAgent } from "@/components/app/console-agent";
import { statistiquesAgent } from "@/server/services/stats-service";
import { obtenirEntretienActif } from "@/server/services/interview-service";
import { obtenirCampagneActive } from "@/server/services/survey-service";
import { obtenirDialerMeta } from "@/lib/dialer/registry";

export const metadata = { title: "Session d'appels — UNITED Research" };
export const dynamic = "force-dynamic";

/** Agent workspace — intentionally minimal: receive, call, interview, next.
 *  UNITED Research: affiche aussi le script d'introduction de la campagne active. */
export default async function PageSession() {
  const session = await exigerAcces(["AGENT", "ADMINISTRATEUR"]);
  const [stats, entretienActif, campagneActive] = await Promise.all([
    statistiquesAgent(session.sub),
    obtenirEntretienActif(session.sub),
    obtenirCampagneActive(),
  ]);

  const prenom = session.nom.split(" ")[0];

  const versionActive = campagneActive?.versions?.[0]
    ? {
        titre: campagneActive.title,
        versionNumber: campagneActive.versions[0].versionNumber,
        nbQuestions: campagneActive.versions[0].questions.length,
      }
    : null;

  const scriptIntro = campagneActive?.openingScript
    ? {
        script: campagneActive.openingScript,
        candidat: campagneActive.candidateName,
        conformite: campagneActive.complianceMessage,
      }
    : null;

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
      versionActive={versionActive}
      scriptIntro={scriptIntro}
      dialer={obtenirDialerMeta()}
    />
  );
}
