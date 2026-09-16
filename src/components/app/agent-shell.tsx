"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LIBELLES_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";
import { DeconnexionBouton } from "@/components/app/deconnexion-bouton";
import { History } from "lucide-react";

/**
 * UNITED Research — Shell simplifié pour les agents.
 *
 * Pas de sidebar, pas de menu hamburger. L'agent n'a accès qu'à la session
 * d'appels et son historique — pas besoin de navigation complexe.
 *
 * Layout: top nav compact (logo + nom + bouton Historique + logout) + contenu.
 */
export function AgentShell({
  nom,
  role,
  children,
}: {
  nom: string;
  role: RoleUtilisateur;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top navigation — compact, no sidebar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Link href="/session" className="flex items-center" aria-label="UNITED Research — session">
            {/* logo statique — pas besoin d'optimisation next/image */}
            <img
              src="/united-research-logo-nav.png"
              alt="UNITED Research"
              width={120}
              height={32}
              className="h-8 w-auto"
            />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/session/historique">
                <History className="h-4 w-4" /> Historique
              </Link>
            </Button>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-foreground">{nom}</p>
              <p className="text-xs leading-tight text-muted-foreground">{LIBELLES_ROLE[role]}</p>
            </div>
            <DeconnexionBouton />
          </div>
        </div>
      </header>

      {/* Contenu — pas de sidebar, plein écran */}
      <main className="min-w-0 flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
