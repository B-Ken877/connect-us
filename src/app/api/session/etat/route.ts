import { NextResponse } from "next/server";
import { exigerRole } from "@/lib/auth/session";
import { statistiquesAgent } from "@/server/services/stats-service";
import { battement } from "@/server/services/agent-session-service";
import { obtenirEntretienActif } from "@/server/services/interview-service";
import { versMessageUtilisateur } from "@/lib/errors";

/**
 * Agent console feed + heartbeat (GET poll every ~15 s):
 * refreshes presence freshness, personal stats and the current interview
 * to resume (interview-first workflow).
 */
export async function GET() {
  try {
    const utilisateur = await exigerRole(["AGENT", "ADMINISTRATEUR"]);
    await battement(utilisateur.id);
    const [stats, entretienActif] = await Promise.all([
      statistiquesAgent(utilisateur.id),
      obtenirEntretienActif(utilisateur.id),
    ]);
    return NextResponse.json(
      {
        stats,
        entretienActif: entretienActif
          ? {
              interviewId: entretienActif.id,
              nom: entretienActif.respondent.name,
              telephone: entretienActif.respondent.phone,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erreur) {
    const message = versMessageUtilisateur(erreur);
    const statut = message.includes("session") ? 401 : 500;
    return NextResponse.json({ erreur: message }, { status: statut });
  }
}
