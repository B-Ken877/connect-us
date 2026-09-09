"use client";

import type { DialerMeta, ResultatInitiation } from "@/lib/dialer/types";

/**
 * Client-side dial initiation.
 * - native mode  → hands the number to the OS/browser via the tel: scheme
 *   (mobile devices open the dialer, desktops with a calling app open it too;
 *   otherwise the browser shows its handler dialog). The platform never
 *   fabricates call state: the agent records the actual outcome.
 * - serveur mode → reserved for a future telephony provider: the client asks
 *   the server route to initiate the call through DialerProvider.
 *   (NOT implemented in V1 — no telephony provider selected yet.)
 */
export async function initierAppel(params: {
  dialer: DialerMeta;
  numero: string;
  callAttemptId: string;
}): Promise<ResultatInitiation> {
  const { dialer, numero, callAttemptId } = params;
  const numeroPropre = numero.replace(/[^\d+]/g, "");

  if (dialer.mode === "client") {
    try {
      window.location.href = `tel:${numeroPropre}`;
      return { statut: "INITIE" };
    } catch {
      return {
        statut: "NON_SUPPORTE",
        message:
          "Votre appareil ne prend pas en charge la composition téléphonique. Composez manuellement le numéro affiché.",
      };
    }
  }

  // Future server-side telephony provider hook.
  try {
    const reponse = await fetch(`/api/appels/${callAttemptId}/composer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ numero: numeroPropre }),
    });
    if (!reponse.ok) {
      return { statut: "ERREUR", message: "L'initiation de l'appel a échoué côté serveur." };
    }
    const donnees = (await reponse.json()) as ResultatInitiation;
    return donnees;
  } catch {
    return { statut: "ERREUR", message: "L'initiation de l'appel a échoué (réseau)." };
  }
}
