import { NextResponse } from "next/server";
import { exigerRole } from "@/lib/auth/session";
import { statistiquesAgent } from "@/server/services/stats-service";
import { battement } from "@/server/services/agent-session-service";
import { obtenirAppelActif } from "@/server/services/call-service";
import { versMessageUtilisateur } from "@/lib/errors";

/**
 * Agent console feed + heartbeat (GET poll every ~15 s):
 * refreshes presence freshness, personal stats and any active call to resume.
 */
export async function GET() {
  try {
    const utilisateur = await exigerRole(["AGENT", "ADMINISTRATEUR"]);
    await battement(utilisateur.id);
    const [stats, appelActif] = await Promise.all([
      statistiquesAgent(utilisateur.id),
      obtenirAppelActif(utilisateur.id),
    ]);
    return NextResponse.json(
      {
        stats,
        appelActif: appelActif
          ? { appelId: appelActif.id, nom: appelActif.respondent.name, telephone: appelActif.respondent.phone }
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
