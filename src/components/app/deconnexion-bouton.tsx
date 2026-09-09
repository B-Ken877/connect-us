"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, LoaderCircle } from "lucide-react";
import { quitterSession } from "@/server/actions/auth-actions";

export function DeconnexionBouton() {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          await quitterSession();
          router.refresh();
        })
      }
      className="gap-2"
      aria-label="Déconnexion"
    >
      {enCours ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span className="hidden sm:inline">Déconnexion</span>
    </Button>
  );
}
