import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES_VERSION: Record<string, string> = {
  BROUILLON: "bg-slate-100 text-slate-600 border-slate-200",
  PUBLIEE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ARCHIVEE: "bg-slate-100 text-slate-500 border-slate-200",
};

export function BadgeStatutVersion({ statut }: { statut: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STYLES_VERSION[statut])}>
      {statut === "BROUILLON" ? "Brouillon" : statut === "PUBLIEE" ? "Publiée" : "Archivée"}
    </Badge>
  );
}
