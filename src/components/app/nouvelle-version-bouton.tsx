"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Copy, LoaderCircle } from "lucide-react";
import { actionCreerVersion } from "@/server/actions/survey-actions";

/**
 * Always-visible entry point to question editing: published versions are
 * immutable (DB-enforced), so editing the questionnaire always means creating
 * a new draft version (clone of the latest) and opening the editor.
 */
export function NouvelleVersionBouton({
  enqueteId,
  compact = false,
}: {
  enqueteId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  function creer() {
    demarrer(async () => {
      const r = await actionCreerVersion(enqueteId);
      if (r.succes) {
        toast({
          title: "Nouveau brouillon créé",
          description: "Clone de la dernière version — modifiez-le puis publiez.",
        });
        router.push(`/enquetes/${enqueteId}/edition`);
        router.refresh();
      } else {
        toast({ title: "Action impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  return (
    <Button
      onClick={creer}
      disabled={enCours}
      size={compact ? "sm" : "default"}
      variant={compact ? "outline" : "default"}
      className="gap-2"
    >
      {enCours ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
      Nouvelle version
    </Button>
  );
}
