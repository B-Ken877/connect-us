/**
 * UNITED Research — Nettoyage du stockage navigateur legacy.
 *
 * Au moment du rebrand (GIG Survey → UNITED Research), les clés localStorage
 * et sessionStorage ont été renommées de `gig:*` à `united:*`. Les anciennes
 * clés `gig:*` dans les navigateurs des utilisateurs existants peuvent causer
 * des bugs (état hydraté incorrect, conflits). Cette fonction les supprime
 * proprement au chargement de l'application.
 *
 * Sans ce nettoyage, un agent qui avait un entretien en cours avant le rebrand
 * pourrait voir des données fantômes réapparaître (localStorage `gig:entretien:*`).
 */

export function nettoyerStockageLegacy(): void {
  if (typeof window === "undefined") return;

  try {
    // localStorage — supprimer les clés gig:*
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const cle = localStorage.key(i);
      if (cle && cle.startsWith("gig:")) {
        localStorage.removeItem(cle);
      }
    }

    // sessionStorage — supprimer les clés gig:*
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const cle = sessionStorage.key(i);
      if (cle && cle.startsWith("gig:")) {
        sessionStorage.removeItem(cle);
      }
    }
  } catch {
    // Storage peut être indisponible (mode privé, quota, etc.) — non bloquant.
  }
}
