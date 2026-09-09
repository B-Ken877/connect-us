import type { DialerMeta } from "@/lib/dialer/types";
import { config } from "@/lib/config";

/**
 * Server-safe dialer registry (no window access — usable in RSC / actions).
 * The active provider is selected via DIALER_PROVIDER; "native" is the V1
 * default. Adding "telephony-api" later = one new provider module + a case
 * here, zero change elsewhere.
 */

const REGISTRE_META: Record<string, DialerMeta> = {
  native: {
    id: "native",
    label: "Composeur natif de l'appareil",
    mode: "client",
  },
  "telephony-api": {
    id: "telephony-api",
    label: "Intégration téléphonie (à venir)",
    mode: "serveur",
  },
};

export function obtenirDialerMeta(): DialerMeta {
  const id = config.dialer.provider;
  return REGISTRE_META[id] ?? REGISTRE_META.native;
}

export function dialerEstDisponible(): boolean {
  const meta = obtenirDialerMeta();
  return meta.mode === "client" || config.dialer.provider === "telephony-api";
}
