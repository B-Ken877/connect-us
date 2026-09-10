/**
 * DETERMINISTIC PHONE NORMALIZATION FOR tel: URIs.
 *
 * Deployment context: Haitian CATI center — respondents are called on the
 * Haitian plan (+509 country code, 8-digit local numbers; landlines start
 * with 2, mobiles with 3 or 4). The helper is intentionally small and pure
 * (no library, no framework) so it can be unit-tested and reused by any
 * DialerProvider implementation.
 *
 * Rules — first match wins:
 *   0. fewer than 6 digits or no digits at all  → null (cannot be dialed)
 *   1. leading « + »  → the operator declared a full international number:
 *      digits are kept verbatim (no blind rewriting)
 *   2. leading « 00 » → international dial-out prefix replaced by « + »
 *   3. 509 + 8 digits (11 total, no +) → Haitian country code present → « +509… »
 *   4. exactly 8 digits starting with 2/3/4 → Haitian local number → « +509… »
 *   5. anything else (ambiguous local format, e.g. demo data) → bare digits:
 *      a valid tel: URI per RFC 3966; the OS dialer applies its own locale
 *      rules. We NEVER invent a country code for an unrecognized format.
 */

const MIN_CHIFFRES = 6;

export function normaliserNumeroTel(entree: string): string | null {
  if (!entree) return null;
  const nettoye = entree.trim();
  if (!nettoye) return null;

  const aUnPlus = nettoye.startsWith("+");
  const chiffres = nettoye.replace(/\D/g, "");
  if (chiffres.length < MIN_CHIFFRES) return null;

  if (aUnPlus) return `+${chiffres}`;
  if (chiffres.startsWith("00")) return `+${chiffres.slice(2)}`;
  if (chiffres.length === 11 && chiffres.startsWith("509")) return `+${chiffres}`;
  if (chiffres.length === 8 && /^[234]/.test(chiffres)) return `+509${chiffres}`;
  return chiffres;
}

/** Final `tel:` URI handed to the operating system (Phone Link on Windows). */
export function construireUriTel(entree: string): string | null {
  const numero = normaliserNumeroTel(entree);
  return numero ? `tel:${numero}` : null;
}
