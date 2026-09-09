import { cn } from "@/lib/utils";

export function EnTetePage({
  titre,
  description,
  actions,
}: {
  titre: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{titre}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CarteStat({
  libelle,
  valeur,
  detail,
  ton = "neutre",
}: {
  libelle: string;
  valeur: string | number;
  detail?: string;
  ton?: "neutre" | "positif" | "alerte" | "critique";
}) {
  const tons: Record<string, string> = {
    neutre: "text-slate-900",
    positif: "text-teal-700",
    alerte: "text-amber-600",
    critique: "text-red-600",
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="libelle-section">{libelle}</p>
      <p className={cn("chiffre-cle mt-2 text-3xl font-semibold", tons[ton])}>{valeur}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function EtatVide({
  titre,
  description,
  action,
}: {
  titre: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-900">{titre}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
