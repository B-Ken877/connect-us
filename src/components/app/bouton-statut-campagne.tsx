"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LoaderCircle, CheckCircle2, Pause, Play, Archive, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { actionMajStatutEnquete } from "@/server/actions/survey-actions";

const LIBELLES: Record<string, string> = {
  BROUILLON: "Brouillon",
  PUBLIEE: "Active",
  ARCHIVEE: "Archivée",
  EN_PAUSE: "En pause",
  TERMINEE: "Terminée",
};

export function BoutonStatutCampagne({
  enqueteId,
  statut,
}: {
  enqueteId: string;
  statut: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  function changerStatut(nouveauStatut: "PUBLIEE" | "EN_PAUSE" | "TERMINEE" | "ARCHIVEE") {
    demarrer(async () => {
      const r = await actionMajStatutEnquete({ enqueteId, statut: nouveauStatut });
      if (r.succes) {
        toast({ title: "Statut mis à jour", description: r.message });
        router.refresh();
      } else {
        toast({ title: "Erreur", description: r.message, variant: "destructive" });
      }
    });
  }

  const couleur = statut === "PUBLIEE" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : statut === "TERMINEE" ? "border-blue-200 bg-blue-50 text-blue-700"
    : statut === "EN_PAUSE" ? "border-amber-200 bg-amber-50 text-amber-700"
    : statut === "ARCHIVEE" ? "border-slate-200 bg-slate-50 text-slate-600"
    : "border-border bg-muted";

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={couleur}>
        {LIBELLES[statut] ?? statut}
      </Badge>

      {statut !== "TERMINEE" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={enCours}>
              {enCours ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Marquer comme terminée
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Marquer cette campagne comme terminée ?</AlertDialogTitle>
              <AlertDialogDescription>
                La campagne ne sera plus active. Les agents ne pourront plus recevoir de contacts
                pour cette campagne. Les données collectées restent consultables.
                Vous pourrez la réactiver plus tard si nécessaire.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => changerStatut("TERMINEE")}>
                Oui, terminer la campagne
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {statut === "PUBLIEE" && (
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={enCours} onClick={() => changerStatut("EN_PAUSE")}>
          <Pause className="h-3.5 w-3.5" /> Mettre en pause
        </Button>
      )}

      {statut === "EN_PAUSE" && (
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={enCours} onClick={() => changerStatut("PUBLIEE")}>
          <Play className="h-3.5 w-3.5" /> Réactiver
        </Button>
      )}

      {statut === "TERMINEE" && (
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={enCours} onClick={() => changerStatut("PUBLIEE")}>
          <Play className="h-3.5 w-3.5" /> Rouvrir la campagne
        </Button>
      )}
    </div>
  );
}
