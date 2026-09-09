import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LIBELLES_STATUT_APPEL,
  LIBELLES_STATUT_AGENT,
  LIBELLES_STATUT_QUALITE,
  LIBELLES_STATUT_REPONDANT,
  LIBELLES_STATUT_ENTRETIEN,
  LIBELLES_SEVERITE,
} from "@/lib/format";

/** Status badges — consistent institutional styling across the platform. */

const STYLES: Record<string, string> = {
  // appels
  EN_COURS: "bg-teal-50 text-teal-700 border-teal-200",
  TERMINE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  SANS_REPONSE: "bg-slate-100 text-slate-600 border-slate-200",
  OCCUPE: "bg-slate-100 text-slate-600 border-slate-200",
  NUMERO_INCORRECT: "bg-orange-50 text-orange-700 border-orange-200",
  REFUS: "bg-red-50 text-red-700 border-red-200",
  RAPPEL: "bg-amber-50 text-amber-700 border-amber-200",
  ABANDONNE: "bg-slate-100 text-slate-600 border-slate-200",
  // agents
  DISPONIBLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  EN_APPEL: "bg-teal-50 text-teal-700 border-teal-200",
  EN_ENTRETIEN: "bg-teal-50 text-teal-700 border-teal-200",
  EN_PAUSE: "bg-amber-50 text-amber-700 border-amber-200",
  HORS_LIGNE: "bg-slate-100 text-slate-500 border-slate-200",
  // qualité / entretien
  NON_EXAMINE: "bg-slate-100 text-slate-600 border-slate-200",
  A_EXAMINER: "bg-amber-50 text-amber-700 border-amber-200",
  VALIDE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJETE: "bg-red-50 text-red-700 border-red-200",
  FAUX_POSITIF: "bg-slate-100 text-slate-600 border-slate-200",
  INTERROGE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RAPPEL_PLANIFIE: "bg-amber-50 text-amber-700 border-amber-200",
  INJOIGNABLE: "bg-slate-100 text-slate-500 border-slate-200",
  EXCLU: "bg-red-50 text-red-700 border-red-200",
  BROUILLON: "bg-slate-100 text-slate-600 border-slate-200",
  PUBLIEE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ARCHIVEE: "bg-slate-100 text-slate-500 border-slate-200",
  // sévérité
  FAIBLE: "bg-slate-100 text-slate-600 border-slate-200",
  MOYENNE: "bg-amber-50 text-amber-700 border-amber-200",
  ELEVEE: "bg-orange-50 text-orange-700 border-orange-200",
  CRITIQUE: "bg-red-50 text-red-700 border-red-200",
};

function BadgeStatut({ statut, libelle }: { statut: string; libelle: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STYLES[statut] ?? STYLES["SANS_REPONSE"])}>
      {libelle}
    </Badge>
  );
}

export function BadgeAppel({ statut }: { statut: string }) {
  return <BadgeStatut statut={statut} libelle={LIBELLES_STATUT_APPEL[statut] ?? statut} />;
}
export function BadgeAgent({ statut }: { statut: string }) {
  return <BadgeStatut statut={statut} libelle={LIBELLES_STATUT_AGENT[statut] ?? statut} />;
}
export function BadgeQualite({ statut }: { statut: string }) {
  return <BadgeStatut statut={statut} libelle={LIBELLES_STATUT_QUALITE[statut] ?? statut} />;
}
export function BadgeRepondant({ statut }: { statut: string }) {
  return <BadgeStatut statut={statut} libelle={LIBELLES_STATUT_REPONDANT[statut] ?? statut} />;
}
export function BadgeEntretien({ statut }: { statut: string }) {
  return <BadgeStatut statut={statut} libelle={LIBELLES_STATUT_ENTRETIEN[statut] ?? statut} />;
}
export function BadgeSeverite({ severite }: { severite: string }) {
  return <BadgeStatut statut={severite} libelle={LIBELLES_SEVERITE[severite] ?? severite} />;
}
