import { NextResponse } from "next/server";
import { exigerRole } from "@/lib/auth/session";
import { statistiquesSupervision } from "@/server/services/stats-service";
import { versMessageUtilisateur } from "@/lib/errors";

/**
 * Supervisor console feed — short polling (10 s), no WebSockets.
 * Server-side role enforcement happens here (middleware is a first barrier only).
 */
export async function GET() {
  try {
    await exigerRole(["ADMINISTRATEUR", "SUPERVISEUR"]);
    const stats = await statistiquesSupervision();
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (erreur) {
    const message = versMessageUtilisateur(erreur);
    const statut = message.includes("session") ? 401 : message.includes("autoris") ? 403 : 500;
    return NextResponse.json({ erreur: message }, { status: statut });
  }
}
