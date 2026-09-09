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
  { href: "/tableau-de-bord", libelle: "Tableau de bord", icone: LayoutDashboard, roles: ["ADMINISTRATEUR", "GESTIONNAIRE"] },
  { href: "/session", libelle: "Session d'appels", icone: PhoneCall, roles: ["AGENT", "ADMINISTRATEUR"] },
  { href: "/enquetes", libelle: "Enquêtes", icone: ClipboardList, roles: ["ADMINISTRATEUR", "GESTIONNAIRE"] },
  { href: "/repondants", libelle: "Répondants", icone: Users, roles: ["ADMINISTRATEUR", "GESTIONNAIRE", "SUPERVISEUR"] },
  { href: "/entretiens", libelle: "Entretiens", icone: UserCheck, roles: ["ADMINISTRATEUR", "GESTIONNAIRE", "SUPERVISEUR"] },
  { href: "/supervision", libelle: "Tableau de supervision", icone: Activity, roles: ["ADMINISTRATEUR", "SUPERVISEUR"] },
  { href: "/controle-qualite", libelle: "Contrôle qualité", icone: ShieldCheck, roles: ["ADMINISTRATEUR", "SUPERVISEUR"] },
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
                ? "bg-primary text-primary-foreground"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
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
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              GIG Survey
              <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                Centre d&apos;études d&apos;opinion
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900">{nom}</p>
              <p className="text-xs leading-tight text-muted-foreground">{LIBELLES_ROLE[role]}</p>
            </div>
            <DeconnexionBouton />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          {liens}
        </aside>
        {menuOuvert && (
          <div className="fixed inset-x-0 top-14 z-30 border-b border-slate-200 bg-white p-4 shadow-lg lg:hidden">
            {liens}
          </div>
        )}
        <main className="min-w-0 flex-1 bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
