/**
 * Role → route authorization matrix.
 * SINGLE SOURCE OF TRUTH used by: middleware (edge), server guards, and
 * navigation rendering. Server-side enforcement is always re-applied inside
 * actions and route handlers (never rely on frontend checks alone).
 *
 * Two roles only: ADMINISTRATEUR manages everything (surveys, respondents,
 * interviews, quality, accounts) and can also take calls; AGENT only runs
 * the calling session.
 */

export type RoleUtilisateur = "ADMINISTRATEUR" | "AGENT";

export const LIBELLES_ROLE: Record<RoleUtilisateur, string> = {
  ADMINISTRATEUR: "Administrateur",
  AGENT: "Agent",
};

export interface RegleAcces {
  prefix: string;
  roles: RoleUtilisateur[];
}

export const REGLES_ACCES: RegleAcces[] = [
  { prefix: "/session", roles: ["AGENT", "ADMINISTRATEUR"] },
  { prefix: "/tableau-de-bord", roles: ["ADMINISTRATEUR"] },
  { prefix: "/enquetes", roles: ["ADMINISTRATEUR"] },
  { prefix: "/repondants", roles: ["ADMINISTRATEUR"] },
  { prefix: "/entretiens", roles: ["ADMINISTRATEUR"] },
  { prefix: "/supervision", roles: ["ADMINISTRATEUR"] },
  { prefix: "/controle-qualite", roles: ["ADMINISTRATEUR"] },
  { prefix: "/journal-connexions", roles: ["ADMINISTRATEUR"] },
  { prefix: "/agents", roles: ["ADMINISTRATEUR"] },
  { prefix: "/parametres", roles: ["ADMINISTRATEUR"] },
];

export const ACCUEIL_PAR_ROLE: Record<RoleUtilisateur, string> = {
  AGENT: "/session",
  ADMINISTRATEUR: "/tableau-de-bord",
};

/** Route is public (no session required)? */
export function estRoutePublique(chemin: string): boolean {
  return (
    chemin === "/connexion" ||
    chemin === "/api/sante" ||
    chemin.startsWith("/_next") ||
    chemin === "/favicon.ico" ||
    chemin.startsWith("/images/") ||
    chemin === "/manifest.webmanifest"
  );
}

/** Routes accessibles à tout utilisateur authentifié (quel que soit le rôle),
 *  même si son mot de passe doit être changé. */
export function estRouteObligatoire(chemin: string): boolean {
  return chemin === "/changer-mot-de-passe";
}

/** Which roles may access this path? (longest-prefix match) */
export function rolesPourChemin(chemin: string): RoleUtilisateur[] | null {
  let meilleur: RegleAcces | null = null;
  for (const regle of REGLES_ACCES) {
    if (chemin === regle.prefix || chemin.startsWith(`${regle.prefix}/`)) {
      if (!meilleur || regle.prefix.length > meilleur.prefix.length) meilleur = regle;
    }
  }
  return meilleur ? meilleur.roles : null;
}

export function accesAutorise(chemin: string, role: RoleUtilisateur): boolean {
  const roles = rolesPourChemin(chemin);
  if (!roles) return true; // authenticated-only area with no extra restriction
  return roles.includes(role);
}
