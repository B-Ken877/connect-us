"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  PhoneCall,
  ClipboardList,
  Users,
  UserCheck,
  Activity,
  ShieldCheck,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIBELLES_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { DeconnexionBouton } from "@/components/app/deconnexion-bouton";

interface ElementMenu {
  href: string;
  libelle: string;
  icone: React.ComponentType<{ className?: string }>;
  roles: RoleUtilisateur[];
}

const MENU: ElementMenu[] = [
  { href: "/tableau-de-bord", libelle: "Tableau de bord", icone: LayoutDashboard, roles: ["ADMINISTRATEUR"] },
  { href: "/session", libelle: "Session d'appels", icone: PhoneCall, roles: ["AGENT", "ADMINISTRATEUR"] },
  { href: "/enquetes", libelle: "Campagnes", icone: ClipboardList, roles: ["ADMINISTRATEUR"] },
  { href: "/repondants", libelle: "Contacts", icone: Users, roles: ["ADMINISTRATEUR"] },
  { href: "/entretiens", libelle: "Fiches d'appel", icone: UserCheck, roles: ["ADMINISTRATEUR"] },
  { href: "/supervision", libelle: "Supervision", icone: Activity, roles: ["ADMINISTRATEUR"] },
  { href: "/controle-qualite", libelle: "Contrôle qualité", icone: ShieldCheck, roles: ["ADMINISTRATEUR"] },
  { href: "/agents", libelle: "Agents & comptes", icone: Settings, roles: ["ADMINISTRATEUR"] },
];

export function AppShell({
  nom,
  role,
  children,
}: {
  nom: string;
  role: RoleUtilisateur;
  children: React.ReactNode;
}) {
  const chemin = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);

  const elements = MENU.filter((e) => e.roles.includes(role));

  const liens = (
    <nav className="space-y-1" aria-label="Navigation principale">
      {elements.map((element) => {
        const actif = chemin === element.href || chemin.startsWith(`${element.href}/`);
        const Icone = element.icone;
        return (
          <Link
            key={element.href}
            href={element.href}
            onClick={() => setMenuOuvert(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              actif
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            aria-current={actif ? "page" : undefined}
          >
            <Icone className="h-4 w-4 shrink-0" />
            {element.libelle}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top navigation — white surface, navy logo */}
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuOuvert((v) => !v)}
            aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOuvert}
          >
            {menuOuvert ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <Link href="/" className="flex items-center" aria-label="UNITED Research — accueil">
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
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-foreground">{nom}</p>
              <p className="text-xs leading-tight text-muted-foreground">{LIBELLES_ROLE[role]}</p>
            </div>
            <DeconnexionBouton />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar — navy surface (Option A) */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-sidebar-border bg-sidebar p-4 lg:block">
          {liens}
        </aside>
        {menuOuvert && (
          <div className="fixed inset-x-0 top-14 z-30 border-b border-sidebar-border bg-sidebar p-4 shadow-lg lg:hidden">
            {liens}
          </div>
        )}
        <main className="min-w-0 flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
