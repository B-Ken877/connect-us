"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CalendarClock, Check, ChevronLeft, LoaderCircle, PhoneOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * CALL DISPOSITION — moved to the END of the workflow (no more giant
 * standalone call-result screen). Two logically distinct outcomes:
 *  - "Entretien complété": the questionnaire is complete → atomic save of
 *    interview (TERMINE) + call (TERMINE) + respondent (INTERROGE).
 *  - Other dispositions: the call fell through → the interview is NEVER
 *    submitted as completed; the real outcome is recorded instead.
 */

const SANS_ENTRETIEN: { statut: string; libelle: string; classe: string }[] = [
  { statut: "SANS_REPONSE", libelle: "Sans réponse", classe: "border-slate-300 bg-white hover:bg-slate-50" },
  { statut: "OCCUPE", libelle: "Occupé", classe: "border-slate-300 bg-white hover:bg-slate-50" },
  { statut: "MESSAGERIE", libelle: "Messagerie vocale", classe: "border-slate-300 bg-white hover:bg-slate-50" },
  { statut: "REFUS", libelle: "Refusé", classe: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100" },
  { statut: "NUMERO_INCORRECT", libelle: "Mauvais numéro", classe: "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100" },
  { statut: "RAPPEL", libelle: "Rappel demandé", classe: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" },
  { statut: "NE_PAS_RAPPELER", libelle: "Ne plus appeler", classe: "border-red-300 bg-red-100 text-red-900 hover:bg-red-200" },
  { statut: "AUTRE", libelle: "Autre", classe: "border-slate-300 bg-white hover:bg-slate-50" },
];

interface Props {
  /** True when the questionnaire has been validated and handed over. */
  questionnaireComplet: boolean;
  /** Status currently being saved (double-click lock), null otherwise. */
  envoi: string | null;
  onTerminerEntretien: (notes: string) => void;
  onCloturer: (statut: string, donnees: { notes: string; rappelDate?: string; rappelHeure?: string }) => void;
  onRevenirQuestionnaire: () => void;
}

export function PanneauDisposition({
  questionnaireComplet,
  envoi,
  onTerminerEntretien,
  onCloturer,
  onRevenirQuestionnaire,
}: Props) {
  const [notes, setNotes] = useState("");
  const [rappelDate, setRappelDate] = useState("");
  const [rappelHeure, setRappelHeure] = useState("");
  const [rappelOuvert, setRappelOuvert] = useState(false);

  const occupe = envoi !== null;

  function verifierRappel(statut: string): boolean {
    if (statut === "RAPPEL" && (!rappelDate || !rappelHeure)) {
      toast({
        title: "Rappel incomplet",
        description: "Indiquez la date et l'heure du rappel.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  function choisirSansEntretien(statut: string) {
    if (!verifierRappel(statut)) return;
    onCloturer(statut, {
      notes,
      rappelDate: statut === "RAPPEL" ? rappelDate : undefined,
      rappelHeure: statut === "RAPPEL" ? rappelHeure : undefined,
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <p className="text-sm font-semibold text-slate-900">Comment s&apos;est terminé l&apos;appel ?</p>

        {/* Primary: completed interview */}
        <Button
          size="lg"
          className={cn("h-14 w-full gap-2 text-base", !questionnaireComplet && "opacity-50")}
          disabled={!questionnaireComplet || occupe}
          onClick={() => onTerminerEntretien(notes)}
        >
          {envoi === "TERMINE" ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
          {envoi === "TERMINE" ? "Envoi…" : "Entretien complété"}
        </Button>
        {!questionnaireComplet && (
          <p className="text-xs text-muted-foreground">
            Terminez d&apos;abord toutes les questions obligatoires du questionnaire (bouton « Terminer
            l&apos;entretien »), puis revenez enregistrer l&apos;appel.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            ou clôturer sans entretien
          </span>
          <Separator className="flex-1" />
        </div>

        {/* Secondary: the call fell through */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SANS_ENTRETIEN.map((r) => (
            <Button
              key={r.statut}
              variant="outline"
              className={cn("h-11 justify-center", r.classe, envoi === r.statut && "ring-2 ring-primary/40")}
              disabled={occupe}
              onClick={() => {
                if (r.statut === "RAPPEL") {
                  setRappelOuvert(true);
                  return;
                }
                choisirSansEntretien(r.statut);
              }}
            >
              {envoi === r.statut ? (
                <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="mr-1 h-4 w-4 opacity-60" />
              )}
              {r.libelle}
            </Button>
          ))}
        </div>

        {/* Callback scheduling — existing callback backend, nothing new */}
        {rappelOuvert && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <CalendarClock className="h-4 w-4" /> Planifier le rappel
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rappel-date">Date</Label>
                <Input
                  id="rappel-date"
                  type="date"
                  value={rappelDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setRappelDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rappel-heure">Heure</Label>
                <Input
                  id="rappel-heure"
                  type="time"
                  value={rappelHeure}
                  onChange={(e) => setRappelHeure(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => choisirSansEntretien("RAPPEL")}
              disabled={occupe}
            >
              {envoi === "RAPPEL" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarClock className="h-4 w-4" />
              )}
              Confirmer le rappel
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="notes-appel">Notes d&apos;appel (facultatif)</Label>
          <Textarea
            id="notes-appel"
            rows={2}
            placeholder="Contexte, indisponibilité, meilleur moment pour rappeler…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </div>

        <Button variant="ghost" className="gap-1.5 text-muted-foreground" onClick={onRevenirQuestionnaire}>
          <ChevronLeft className="h-4 w-4" /> Revenir au questionnaire
        </Button>
      </CardContent>
    </Card>
  );
}
