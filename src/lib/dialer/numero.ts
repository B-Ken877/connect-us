/**
 * GENERIC PHONE NORMALIZATION FOR tel: URIs (E.164-friendly).
 *
 * UNITED Research — international outreach platform. The phone logic is
 * country-agnostic: we never invent a country code. The operator/admin is
 * responsible for entering contacts with their international prefix.
 *
 * Rules — first match wins:
 *   0. fewer than 6 digits or no digits at all  → null (cannot be dialed)
 *   1. leading « + »  → the operator declared a full international number:
 *      digits are kept verbatim (no blind rewriting)
 *   2. leading « 00 » → international dial-out prefix replaced by « + »
 *   3. anything else (local format without country code) → bare digits:
 *      a valid tel: URI per RFC 3966; the OS dialer applies its own locale
 *      rules. We NEVER invent a country code for an unrecognized format.
 *
 * This replaces the previous Haiti-specific normalization (+509 hard-coded).
 * Haitian numbers still work correctly IF entered with their +509 prefix.
 */

const MIN_CHIFFRES = 6;

export function normaliserNumeroTel(entree: string): string | null {
  if (!entree) return null;
  const nettoye = entree.trim();
  if (!nettoye) return null;

  // Détecte un « + » avant le premier chiffre (ex: "+509...", "(+509)...").
  // Si présent, c'est un numéro international déclaré explicitement.
  const indexPremierChiffre = nettoye.search(/\d/);
  const aUnPlus = indexPremierChiffre >= 0 && nettoye.slice(0, indexPremierChiffre).includes("+");

  const chiffres = nettoye.replace(/\D/g, "");
  if (chiffres.length < MIN_CHIFFRES) return null;

  if (aUnPlus) return `+${chiffres}`;
  if (chiffres.startsWith("00")) return `+${chiffres.slice(2)}`;
  // Local format without country code — keep bare digits (RFC 3966 valid).
  // The OS dialer handles locale rules. We never invent a country code.
  return chiffres;
}

/** Final `tel:` URI handed to the operating system (Phone Link on Windows). */
export function construireUriTel(entree: string): string | null {
  const numero = normaliserNumeroTel(entree);
  return numero ? `tel:${numero}` : null;
}
