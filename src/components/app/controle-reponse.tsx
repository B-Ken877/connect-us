"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QuestionDef, ValeurReponse } from "@/lib/survey-engine/types";

/**
 * Answer controls per question type. Controlled by the interview runner;
 * a change emits the canonical ValeurReponse for the question.
 */

interface Props {
  question: QuestionDef;
  valeur: ValeurReponse | undefined;
  onChange: (valeur: ValeurReponse) => void;
  desactive?: boolean;
}

export function ControleReponse({ question, valeur, onChange, desactive }: Props) {
  const cfg = question.configuration ?? {};

  switch (question.type) {
    case "TEXTE_COURT":
      return (
        <Input
          id={`q-${question.key}`}
          value={valeur?.texte ?? ""}
          onChange={(e) => onChange({ texte: e.target.value })}
          placeholder={cfg.placeholder ?? "Saisir la réponse…"}
          maxLength={cfg.texteMax ?? 500}
          disabled={desactive}
          autoComplete="off"
        />
      );

    case "TEXTE_LONG":
      return (
        <Textarea
          id={`q-${question.key}`}
          rows={4}
          value={valeur?.texte ?? ""}
          onChange={(e) => onChange({ texte: e.target.value })}
          placeholder={cfg.placeholder ?? "Saisir la réponse…"}
          maxLength={cfg.texteMax ?? 5000}
          disabled={desactive}
        />
      );

    case "NOMBRE":
      return (
        <div className="relative max-w-[220px]">
          <Input
            id={`q-${question.key}`}
            type="number"
            inputMode="decimal"
            step={cfg.entier ? 1 : "any"}
            min={cfg.nombreMin}
            max={cfg.nombreMax}
            value={valeur?.nombre ?? ""}
            onChange={(e) =>
              onChange({ nombre: e.target.value === "" ? undefined : Number(e.target.value) })
            }
            disabled={desactive}
          />
          {cfg.unite && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {cfg.unite}
            </span>
          )}
        </div>
      );

    case "OUI_NON": {
      const courant = valeur?.booleen;
      return (
        <div className="flex gap-3" role="radiogroup" aria-label={question.text}>
          {[
            { valeur: true, libelle: "Oui" },
            { valeur: false, libelle: "Non" },
          ].map((opt) => (
            <button
              key={String(opt.valeur)}
              type="button"
              role="radio"
              aria-checked={courant === opt.valeur}
              disabled={desactive}
              onClick={() => onChange({ booleen: opt.valeur })}
              className={cn(
                "min-h-11 min-w-28 rounded-lg border-2 px-6 py-2.5 text-base font-medium transition-colors",
                courant === opt.valeur
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
              )}
            >
              {opt.libelle}
            </button>
          ))}
        </div>
      );
    }

    case "CHOIX_UNIQUE":
      return (
        <RadioGroup
          value={valeur?.choix?.[0] ?? ""}
          onValueChange={(v) => onChange({ choix: [v] })}
          disabled={desactive}
          className="gap-2"
        >
          {question.options.map((o) => (
            <Label
              key={o.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-normal transition-colors",
                valeur?.choix?.[0] === o.value
                  ? "border-primary bg-primary/5"
                  : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <RadioGroupItem value={o.value} />
              {o.label}
            </Label>
          ))}
        </RadioGroup>
      );

    case "CHOIX_MULTIPLE": {
      const selection = valeur?.choix ?? [];
      const basculer = (v: string) => {
        onChange({
          choix: selection.includes(v) ? selection.filter((x) => x !== v) : [...selection, v],
        });
      };
      return (
        <div className="space-y-2">
          {question.options.map((o) => (
            <Label
              key={o.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-normal transition-colors",
                selection.includes(o.value)
                  ? "border-primary bg-primary/5"
                  : "border-slate-200 bg-white hover:bg-slate-50",
              )}
            >
              <Checkbox checked={selection.includes(o.value)} onCheckedChange={() => basculer(o.value)} />
              {o.label}
            </Label>
          ))}
        </div>
      );
    }

    case "ECHELLE": {
      const min = cfg.echelleMin ?? 0;
      const max = cfg.echelleMax ?? 10;
      const notes = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={question.text}>
            {notes.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={valeur?.nombre === n}
                disabled={desactive}
                onClick={() => onChange({ nombre: n })}
                className={cn(
                  "min-h-11 w-11 rounded-lg border-2 text-sm font-semibold transition-colors",
                  valeur?.nombre === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {(cfg.echelleMinLibelle || cfg.echelleMaxLibelle) && (
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{cfg.echelleMinLibelle}</span>
              <span>{cfg.echelleMaxLibelle}</span>
            </div>
          )}
        </div>
      );
    }

    case "DATE":
      return (
        <Input
          id={`q-${question.key}`}
          type="date"
          min={cfg.dateMin}
          max={cfg.dateMax}
          value={valeur?.date ?? ""}
          onChange={(e) => onChange({ date: e.target.value || undefined })}
          disabled={desactive}
          className="max-w-[220px]"
        />
      );

    case "LISTE_DEROULANTE":
      return (
        <Select
          value={valeur?.choix?.[0] ?? ""}
          onValueChange={(v) => onChange({ choix: [v] })}
          disabled={desactive}
        >
          <SelectTrigger className="max-w-sm min-h-11" id={`q-${question.key}`}>
            <SelectValue placeholder="Sélectionner…" />
          </SelectTrigger>
          <SelectContent>
            {question.options.map((o) => (
              <SelectItem key={o.id} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    default:
      return <p className="text-sm text-red-600">Type de question non pris en charge.</p>;
  }
}
