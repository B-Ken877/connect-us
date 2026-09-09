"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { actionExaminerSignalement } from "@/server/actions/admin-actions";

const DECISIONS = [
  { valeur: "VALIDE", libelle: "Validé — entretien confirmé" },
  { valeur: "REJETE", libelle: "Rejeté — problème confirmé" },
  { valeur: "FAUX_POSITIF", libelle: "Faux positif" },
  { valeur: "A_EXAMINER", libelle: "Remettre à examiner" },
];

/** Flag review dialog — every decision is audited server-side. */
export function ExamenSignalement({
  signalementId,
  statutActuel,
}: {
  signalementId: string;
  statutActuel: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [statut, setStatut] = useState(statutActuel === "A_EXAMINER" ? "VALIDE" : statutActuel);
  const [commentaire, setCommentaire] = useState("");
  const [enCours, demarrer] = useTransition();

  function soumettre() {
    demarrer(async () => {
      const r = await actionExaminerSignalement({ signalementId, statut, commentaire });
      if (r.succes) {
        toast({ title: "Examen enregistré", description: "La décision a été journalisée." });
        setOuvert(false);
      } else {
        toast({ title: "Erreur", description: r.message, variant: "destructive" });
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Examiner
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Examiner le signalement</DialogTitle>
          <DialogDescription>
            Indiquez votre décision. Les entretiens ne sont jamais supprimés automatiquement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Décision</Label>
            <Select value={statut} onValueChange={setStatut}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DECISIONS.map((d) => (
                  <SelectItem key={d.valeur} value={d.valeur}>
                    {d.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`commentaire-${signalementId}`}>Commentaire (facultatif)</Label>
            <Textarea
              id={`commentaire-${signalementId}`}
              rows={3}
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Justification de la décision, contexte…"
              maxLength={2000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOuvert(false)}>
            Annuler
          </Button>
          <Button onClick={soumettre} disabled={enCours}>
            Enregistrer la décision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
