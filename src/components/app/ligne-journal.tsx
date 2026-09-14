"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateHeureFr } from "@/lib/format";
import { ShieldAlert, Clock, Ban, LogIn, LogOut, Globe, User, Info } from "lucide-react";

export interface EntreeJournal {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { name: string; email: string; role: string } | null;
}

const LIBELLES_ACTION: Record<string, string> = {
  CONNEXION: "Connexion réussie",
  ECHEC_CONNEXION: "Échec de connexion (identifiants)",
  DECONNEXION: "Déconnexion manuelle",
  CONNEXION_HORS_SHIFT: "Tentative hors shift",
  DECONNEXION_FIN_SHIFT: "Déconnexion fin de shift",
  CONNEXION_IP_REFUSEE: "Tentative IP non autorisée",
  DECONNEXION_IP_REFUSEE: "Déconnexion IP non autorisée",
};

const LIBELLES_SHIFT: Record<string, string> = {
  SHIFT_1: "Shift 1 (08:00 - 13:55 EST)",
  SHIFT_2: "Shift 2 (14:00 - 20:00 EST)",
};

export function LigneJournalCliquable({
  entree,
}: {
  entree: EntreeJournal;
}) {
  const [ouvert, setOuvert] = useState(false);

  const meta = entree.metadata;
  const ip = typeof meta?.ip === "string" ? meta.ip : "—";
  const emailTente = typeof meta?.email === "string" ? meta.email : null;
  const shift = typeof meta?.shift === "string" ? meta.shift : null;
  const hasIpRestriction = meta?.ipAutorisee !== undefined && meta?.ipAutorisee !== null;

  return (
    <>
      <tr
        onClick={() => setOuvert(true)}
        className="cursor-pointer border-b border-border transition-colors hover:bg-muted/30"
      >
        <td className="p-4">
          <div className="flex items-center gap-2">{iconePourAction(entree.action)}</div>
        </td>
        <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">
          {formatDateHeureFr(entree.createdAt)}
        </td>
        <td className="p-4 text-sm">
          {entree.user ? (
            <div>
              <p className="font-medium text-foreground">{entree.user.name}</p>
              <p className="text-xs text-muted-foreground">{entree.user.email}</p>
            </div>
          ) : emailTente ? (
            <div>
              <p className="font-medium text-foreground">Compte inconnu</p>
              <p className="text-xs text-muted-foreground">{emailTente}</p>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="hidden p-4 text-sm md:table-cell">
          {entree.user?.role === "ADMINISTRATEUR" ? "Admin" : entree.user?.role === "AGENT" ? "Agent" : "—"}
        </td>
        <td className="hidden p-4 text-xs lg:table-cell">
          <div className="space-y-0.5">
            <p><span className="text-muted-foreground">IP :</span> <span className="font-mono">{ip}</span></p>
            <Badge variant="outline" className={badgeClasse(entree.action)}>
              {LIBELLES_ACTION[entree.action] ?? entree.action}
            </Badge>
          </div>
        </td>
      </tr>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {iconePourAction(entree.action)}
              {LIBELLES_ACTION[entree.action] ?? entree.action}
            </DialogTitle>
            <DialogDescription>
              {formatDateHeureFr(entree.createdAt)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Raison principale */}
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="libelle-section mb-1.5">Raison</p>
              <p className="text-sm text-foreground">{raisonPourAction(entree)}</p>
            </div>

            {/* Détails spécifiques */}
            <div className="space-y-3">
              <DetailLigne
                icon={<User className="h-4 w-4 text-muted-foreground" />}
                label="Compte visé"
                value={entree.user ? `${entree.user.name} (${entree.user.email})` : "Compte inconnu"}
              />
              <DetailLigne
                icon={<User className="h-4 w-4 text-muted-foreground" />}
                label="Rôle"
                value={entree.user?.role === "ADMINISTRATEUR" ? "Administrateur" : entree.user?.role === "AGENT" ? "Agent" : "—"}
              />
              <DetailLigne
                icon={<Globe className="h-4 w-4 text-muted-foreground" />}
                label="Adresse IP"
                value={ip}
                mono
              />
              {emailTente && (
                <DetailLigne
                  icon={<User className="h-4 w-4 text-muted-foreground" />}
                  label="E-mail tenté"
                  value={emailTente}
                />
              )}
              {shift && (
                <DetailLigne
                  icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                  label="Shift concerné"
                  value={LIBELLES_SHIFT[shift] ?? shift}
                />
              )}
              {hasIpRestriction && (
                <DetailLigne
                  icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
                  label="Note"
                  value="Une restriction d'IP est active sur ce compte."
                />
              )}
            </div>

            {/* Type d'événement en badge */}
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Type :</span>
              <Badge variant="outline" className={badgeClasse(entree.action)}>
                {entree.action}
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailLigne({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={`text-right text-sm text-foreground ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function iconePourAction(action: string): React.ReactElement {
  switch (action) {
    case "CONNEXION":
      return <LogIn className="h-4 w-4 text-emerald-600" />;
    case "DECONNEXION":
      return <LogOut className="h-4 w-4 text-slate-500" />;
    case "ECHEC_CONNEXION":
      return <ShieldAlert className="h-4 w-4 text-amber-600" />;
    case "CONNEXION_HORS_SHIFT":
      return <Clock className="h-4 w-4 text-amber-600" />;
    case "DECONNEXION_FIN_SHIFT":
      return <Clock className="h-4 w-4 text-slate-500" />;
    case "CONNEXION_IP_REFUSEE":
      return <Ban className="h-4 w-4 text-red-600" />;
    case "DECONNEXION_IP_REFUSEE":
      return <Ban className="h-4 w-4 text-red-600" />;
    default:
      return <ShieldAlert className="h-4 w-4 text-muted-foreground" />;
  }
}

function badgeClasse(action: string): string {
  if (action === "CONNEXION") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (action === "CONNEXION_HORS_SHIFT" || action === "ECHEC_CONNEXION") return "border-amber-200 bg-amber-50 text-amber-700";
  if (action === "CONNEXION_IP_REFUSEE" || action === "DECONNEXION_IP_REFUSEE") return "border-red-200 bg-red-50 text-red-700";
  return "border-border bg-muted";
}

function raisonPourAction(entree: EntreeJournal): string {
  switch (entree.action) {
    case "CONNEXION":
      return "Connexion réussie. L'agent s'est connecté avec succès pendant son shift et depuis une IP autorisée.";
    case "ECHEC_CONNEXION":
      return "Échec de connexion : l'identifiant ou le mot de passe est incorrect. Aucune restriction de shift ou d'IP n'était en cause.";
    case "DECONNEXION":
      return "L'agent s'est déconnecté manuellement.";
    case "CONNEXION_HORS_SHIFT":
      return "Connexion refusée : la tentative a eu lieu en dehors des heures de shift de l'agent. L'agent doit attendre le début de son prochain shift.";
    case "DECONNEXION_FIN_SHIFT":
      return "Déconnexion automatique : le shift de l'agent est terminé. Le système l'a déconnecté automatiquement à la fin de son créneau horaire.";
    case "CONNEXION_IP_REFUSEE":
      return "Connexion refusée : l'adresse IP utilisée n'est pas autorisée pour ce compte. Une restriction d'IP est active sur ce compte.";
    case "DECONNEXION_IP_REFUSEE":
      return "Déconnexion automatique : l'adresse IP a changé pendant la session. La nouvelle IP n'est pas autorisée pour ce compte.";
    default:
      return "Événement non documenté.";
  }
}
