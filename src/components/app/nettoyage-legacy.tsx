"use client";

import { useEffect } from "react";
import { nettoyerStockageLegacy } from "@/lib/cleanup";

/**
 * Nettoie le stockage navigateur legacy (clés gig:*) au montage.
 * Invisible — ne rend rien. Exécuté une seule fois côté client.
 */
export function NettoyageLegacy() {
  useEffect(() => {
    nettoyerStockageLegacy();
  }, []);
  return null;
}
