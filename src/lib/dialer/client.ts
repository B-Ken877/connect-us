"use client";

import type { DialerMeta, ResultatInitiation } from "@/lib/dialer/types";
import { construireUriTel } from "@/lib/dialer/numero";

/**
 * Client-side dial initiation.
 * - native mode  → hands the NORMALIZED number to the operating system via
 *   the standard `tel:` protocol (Windows Phone Link, or any other handler
 *   configured on the workstation; on mobile, the native dialer). The anchor-
 *   click mechanism is the browser-sanctioned user-gesture path: the current
 *   UNITED Research page NEVER navigates away, no timers, no hidden iframes.
 *   The platform never fabricates call state: INITIE strictly means
 *   "the OS telephone handler was requested" — CALL_REQUESTED only.
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

  if (dialer.mode === "client") {
    const uri = construireUriTel(numero);
    if (!uri) {
      return {
        statut: "NON_SUPPORTE",
        message: "Numéro absent ou invalide — composez manuellement le numéro affiché.",
      };
    }
    try {
      invoquerUriTel(uri);
      // The exact URI is surfaced so the workstation setup can be verified:
      // the confirmation shows precisely what was handed to Windows.
      return {
        statut: "INITIE",
        message: `Composition lancée : ${uri}. Si rien ne s'ouvre (Phone Link, composeur), composez le numéro affiché.`,
      };
    } catch {
      return {
        statut: "NON_SUPPORTE",
        message:
          "Votre appareil ne prend pas en charge la composition téléphonique. Composez manuellement le numéro affiché.",
      };
    }
  }

  // Future server-side telephony provider hook.
  const numeroPropre = numero.replace(/[^\d+]/g, "");
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

/**
 * Anchor click = the standard user-gesture navigation to an external
 * protocol. The browser hands `tel:` to the OS handler and keeps the current
 * document intact — the questionnaire stays exactly where the agent left it.
 */
function invoquerUriTel(uri: string): void {
  const ancre = document.createElement("a");
  ancre.href = uri;
  ancre.style.position = "fixed";
  ancre.style.opacity = "0";
  ancre.setAttribute("aria-hidden", "true");
  document.body.appendChild(ancre);
  ancre.click();
  ancre.remove();
}
