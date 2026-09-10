"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { LoaderCircle, PhoneCall, PhoneOff, CalendarClock, Copy, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { initierAppel } from "@/lib/dialer/client";
import type { DialerMeta } from "@/lib/dialer/types";
import {
  actionEnregistrerResultatAppel,
  actionDemarrerEntretien,
} from "@/server/actions/agent-actions";

interface Props {
  appel: { id: string; startedAt: string; attemptNumber: number };
  repondant: { id: string; nom: string | null; telephone: string; reference: string | null; nbTentatives: number };
  enqueteActive: { titre: string; versionNumber: number } | null;
  dialer: DialerMeta;
}

const RESULTATS: { statut: string; libelle: string; classe: string }[] = [
  { statut: "TERMINE", libelle: "Appel terminé", classe: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" },
  { statut: "SANS_REPONSE", libelle: "Sans réponse", classe: "border-slate-300 bg-white hover:bg-slate-50" },
  { statut: "OCCUPE", libelle: "Occupé", classe: "border-slate-300 bg-white hover:bg-slate-50" },
  { statut: "NUMERO_INCORRECT", libelle: "Numéro incorrect", classe: "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100" },
  { statut: "REFUS", libelle: "Refus", classe: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100" },
  { statut: "RAPPEL", libelle: "Rappel", classe: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" },
  { statut: "ABANDONNE", libelle: "Abandonné", classe: "border-slate-300 bg-white hover:bg-slate-50" },
];

/** Call screen: dial via the provider abstraction, record the outcome. */
export function EcranAppel({ appel, repondant, enqueteActive, dialer }: Props) {
  const router = useRouter();
  const [compose, setCompose] = useState(false);
  const [messageDialer, setMessageDialer] = useState<string | null>(null);
  const [resultatChoisi, setResultatChoisi] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [rappelDate, setRappelDate] = useState("");
  const [rappelHeure, setRappelHeure] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [dejaAppele, setDejaAppele] = useState(false);

  // Chronomètre léger côté interface (l'état réel reste en base).
  const [secondes, setSecondes] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecondes((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function appeler() {
    setCompose(true);
    const resultat = await initierAppel({
      dialer,
      numero: repondant.telephone,
      callAttemptId: appel.id,
    });
    if (resultat.statut === "INITIE") {
      setDejaAppele(true);
      setMessageDialer(
        resultat.message ??
          "Composition lancée sur votre appareil. Si rien ne se passe, composez le numéro affiché.",
      );
    } else {
      setMessageDialer(
        resultat.message ??
          "Composition non prise en charge par cet appareil — composez manuellement le numéro affiché.",
      );
      setDejaAppele(true);
    }
  }

  async function enregistrer(statut: string) {
    if (statut === "RAPPEL" && (!rappelDate || !rappelHeure)) {
      toast({
        title: "Rappel incomplet",
        description: "Indiquez la date et l'heure du rappel.",
        variant: "destructive",
      });
      return;
    }
    setResultatChoisi(statut);
    setEnregistrement(true);
    const r = await actionEnregistrerResultatAppel({
      callAttemptId: appel.id,
      statut,
      notes: notes || undefined,
      rappelDate: statut === "RAPPEL" ? rappelDate : undefined,
      rappelHeure: statut === "RAPPEL" ? rappelHeure : undefined,
    });
    setEnregistrement(false);
    if (!r.succes) {
      toast({ title: "Erreur", description: r.message, variant: "destructive" });
      setResultatChoisi(null);
      return;
    }

    if (statut === "TERMINE") {
      if (!enqueteActive) {
        toast({
          title: "Aucune enquête publiée",
          description: "L'appel est enregistré comme terminé, mais aucune enquête n'est disponible.",
          variant: "destructive",
        });
        router.push("/session");
        return;
      }
      const e = await actionDemarrerEntretien(appel.id);
      if (e.succes && e.data) {
        router.push(`/session/entretien/${e.data.interviewId}`);
        return;
      }
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      router.push("/session");
      return;
    }

    toast({ title: "Résultat enregistré", description: "Retour à la file d'attente." });
    router.push("/session");
    router.refresh();
  }

  function copierNumero() {
    navigator.clipboard?.writeText(repondant.telephone).then(
      () => toast({ title: "Numéro copié" }),
      () => undefined,
    );
  }

  const minutes = Math.floor(secondes / 60);
  const secondesAffichees = String(secondes % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Prochain répondant</CardTitle>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              Tentative n°{appel.attemptNumber}
            </Badge>
          </div>
          <CardDescription className="text-xs">
            {repondant.reference ? `Réf. ${repondant.reference}` : "Répondant attribué automatiquement"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-lg font-semibold text-slate-900">{repondant.nom ?? "Répondant"}</p>
            <p className="chiffre-cle mt-1 text-3xl font-semibold tracking-wide text-primary">
              {repondant.telephone}
            </p>
            <button
              type="button"
              onClick={copierNumero}
              className="mx-auto mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-900"
            >
              <Copy className="h-3 w-3" /> Copier le numéro
            </button>
          </div>

          <Button
            size="lg"
            className="h-14 w-full text-base gap-2"
            onClick={appeler}
            disabled={compose}
          >
            {compose ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <PhoneCall className="h-5 w-5" />}
            Appeler
          </Button>

          {messageDialer && (
            <div className="flex items-start gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2.5 text-sm text-teal-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {messageDialer}
                {dejaAppele && (
                  <span className="mt-1 block font-mono text-xs">
                    Composition lancée — chronomètre {minutes}:{secondesAffichees}
                  </span>
                )}
              </span>
            </div>
          )}

          {enqueteActive && (
            <p className="text-center text-xs text-muted-foreground">
              Enquête : {enqueteActive.titre} — v{enqueteActive.versionNumber}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneOff className="h-4 w-4 text-primary" />
            Résultat de l&apos;appel
          </CardTitle>
          <CardDescription>
            Sélectionnez le résultat après avoir parlé au répondant (ou tenté l&apos;appel).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {RESULTATS.map((r) => (
              <Button
                key={r.statut}
                variant="outline"
                className={cn(
                  "h-11 justify-center",
                  r.classe,
                  resultatChoisi === r.statut && "ring-2 ring-primary/40",
                )}
                disabled={enregistrement}
                onClick={() => {
                  setResultatChoisi(r.statut);
                  if (r.statut !== "RAPPEL") enregistrer(r.statut);
                }}
              >
                {enregistrement && resultatChoisi === r.statut ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : r.statut === "TERMINE" ? (
                  <ArrowRight className="h-4 w-4" />
                ) : null}
                {r.libelle}
              </Button>
            ))}
          </div>

          {resultatChoisi === "RAPPEL" && (
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
              <Button className="w-full gap-2" onClick={() => enregistrer("RAPPEL")} disabled={enregistrement}>
                {enregistrement ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                Confirmer le rappel
              </Button>
            </div>
          )}

          <Separator />
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes d&apos;appel (facultatif)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Contexte, indisponibilité, meilleur moment pour rappeler…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
