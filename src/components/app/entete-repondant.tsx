"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, LoaderCircle, PhoneCall } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * COMPACT RESPONDENT HEADER — the operational identity block of the interview
 * workspace: who is being called, which survey is running, and the ONE call
 * button. Honest call state: the native dialer cannot be verified by the web
 * app, so the platform never claims a live cellular call.
 */

export type EtatAppel = "pret" | "lance" | "non_pris_en_charge";

interface Props {
  repondant: { nom: string | null; telephone: string; reference: string | null };
  tentative: number;
  enquete: { titre: string; versionNumber: number };
  etatAppel: EtatAppel;
  messageAppel: string | null;
  secondesAppel: number | null;
  appelVerrouille: boolean;
  surAppeler: () => void;
}

function formaterDuree(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = String(secondes % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function EnteteRepondant({
  repondant,
  tentative,
  enquete,
  etatAppel,
  messageAppel,
  secondesAppel,
  appelVerrouille,
  surAppeler,
}: Props) {
  const [copie, setCopie] = useState(false);

  function copierNumero() {
    navigator.clipboard?.writeText(repondant.telephone).then(
      () => {
        setCopie(true);
        setTimeout(() => setCopie(false), 2000);
      },
      () => toast({ title: "Copie impossible", description: "Copiez le numéro manuellement." }),
    );
  }

  return (
    <section
      aria-label="Répondant et appel"
      className="rounded-lg border border-slate-200 bg-white"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Identity block */}
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Répondant
          </p>
          <p className="truncate text-base font-semibold text-slate-900">
            {repondant.nom ?? "Répondant"}
          </p>
          <p className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-lg font-semibold tracking-wide text-primary">
              {repondant.telephone}
            </span>
            <button
              type="button"
              onClick={copierNumero}
              className="rounded p-1 text-muted-foreground hover:bg-slate-100 hover:text-slate-900"
              aria-label="Copier le numéro"
            >
              {copie ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tentative n°{tentative}
            {repondant.reference ? ` · Réf. ${repondant.reference}` : ""}
          </p>
        </div>

        {/* Survey + call controls */}
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
          <p className="text-xs text-muted-foreground sm:text-right">
            Enquête :{" "}
            <span className="font-medium text-slate-700">
              {enquete.titre} — Version {enquete.versionNumber}
            </span>
          </p>
          <Button
            size="lg"
            className="h-12 gap-2 text-base"
            onClick={surAppeler}
            disabled={appelVerrouille}
          >
            {appelVerrouille ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <PhoneCall className="h-5 w-5" />
            )}
            Appeler
          </Button>

          {/* Honest call state — never claims a verified cellular call */}
          <p aria-live="polite" className="text-xs sm:text-right">
            {etatAppel === "pret" && (
              <span className="flex items-center gap-1.5 text-muted-foreground sm:justify-end">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden />
                Prêt à appeler
              </span>
            )}
            {etatAppel === "lance" && (
              <span className="flex flex-wrap items-center gap-1.5 font-medium text-emerald-700 sm:justify-end">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Appel lancé sur votre téléphone
                {secondesAppel !== null && (
                  <span
                    className="font-mono font-normal text-slate-500"
                    title="Chronomètre d'interface — l'état réel de l'appel reste sur votre téléphone"
                  >
                    {formaterDuree(secondesAppel)}
                  </span>
                )}
              </span>
            )}
            {etatAppel === "non_pris_en_charge" && (
              <span className="flex items-center gap-1.5 font-medium text-amber-700 sm:justify-end">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Composition non prise en charge — composez le numéro manuellement
              </span>
            )}
          </p>
        </div>
      </div>

      {messageAppel && (
        <p
          className={cn(
            "border-t border-slate-100 px-4 py-2 text-xs",
            etatAppel === "lance" ? "bg-emerald-50/60 text-emerald-900" : "bg-amber-50/60 text-amber-900",
          )}
        >
          {messageAppel}
        </p>
      )}
    </section>
  );
}
