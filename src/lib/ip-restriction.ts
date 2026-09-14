/**
 * UNITED Research — Vérification de restriction IP.
 *
 * Règle : si l'utilisateur a ipRestrictionMode = "SPECIFIC" et une IP définie,
 * alors seules les requêtes venant de cette IP sont autorisées.
 * Mode "ANY" (défaut) = aucune restriction.
 */

export interface InfosIpUtilisateur {
  ipRestrictionMode: string | null;
  ipRestriction: string | null;
}

/**
 * Vérifie si l'IP de la requête est autorisée pour cet utilisateur.
 * Retourne { autorise: true } si OK, sinon { autorise: false, message }.
 */
export function verifierIp(
  ipRequete: string,
  infos: InfosIpUtilisateur,
): { autorise: true } | { autorise: false; message: string } {
  // Mode par défaut ou "ANY" = aucune restriction.
  if (!infos.ipRestrictionMode || infos.ipRestrictionMode === "ANY" || !infos.ipRestriction) {
    return { autorise: true };
  }

  // Mode "SPECIFIC" : comparer l'IP de la requête avec l'IP autorisée.
  // Normalisation : trim + lower (pour IPv6).
  const ipAutorisee = infos.ipRestriction.trim().toLowerCase();
  const ipActuelle = ipRequete.trim().toLowerCase();

  if (ipActuelle === ipAutorisee) {
    return { autorise: true };
  }

  // Cas spécial : si l'IP actuelle est "inconnue" (ex: environnement de test),
  // on refuse par sécurité.
  return {
    autorise: false,
    message:
      `Connexion refusée : cette adresse IP n'est pas autorisée pour ce compte. ` +
      `Contactez l'administrateur.`,
  };
}

/** Valide qu'une IP a un format correct (IPv4 ou IPv6). */
export function ipValide(ip: string): { ok: boolean; message?: string } {
  const trim = ip.trim();
  if (!trim) return { ok: false, message: "L'IP ne peut pas être vide." };

  // IPv4 simple : 4 groupes de 0-255 séparés par des points.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4.test(trim)) {
    const parties = trim.split(".").map(Number);
    if (parties.every((n) => n >= 0 && n <= 255)) {
      return { ok: true };
    }
  }

  // IPv6 simple : contient au moins deux ":"
  if (trim.includes(":") && /^[0-9a-f:]+$/i.test(trim)) {
    return { ok: true };
  }

  return { ok: false, message: "Format d'IP invalide (ex: 192.168.1.1 ou ::1)." };
}
