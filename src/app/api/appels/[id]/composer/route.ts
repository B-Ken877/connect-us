import { NextRequest, NextResponse } from "next/server";
import { exigerRole } from "@/lib/auth/session";
import { obtenirDialerMeta } from "@/lib/dialer/registry";
import { versMessageUtilisateur } from "@/lib/errors";

/**
 * Future server-side dial initiation route (telephony provider mode).
 *
 * V1 ships with the NATIVE dialer (client-side tel: scheme) so this route is
 * intentionally NOT wired to any real telephony infrastructure. When a
 * provider is selected, a TelephonyApiDialerProvider implementing
 * `initierCoteServeur` plugs in here without touching surveys, interviews,
 * supervision or the data model.
 */
export async function POST(_request: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  try {
    await exigerRole(["AGENT", "ADMINISTRATEUR"]);
    const dialer = obtenirDialerMeta();
    if (dialer.mode !== "serveur") {
      return NextResponse.json(
        { statut: "NON_SUPPORTE", message: "Le composeur actif fonctionne côté appareil (tel:)." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { statut: "NON_SUPPORTE", message: "Aucun fournisseur de téléphonie n'est configuré." },
      { status: 501 },
    );
  } catch (erreur) {
    return NextResponse.json({ erreur: versMessageUtilisateur(erreur) }, { status: 500 });
  }
}
