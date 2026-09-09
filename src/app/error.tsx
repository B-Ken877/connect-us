"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

/** Global error boundary — French message, never a raw stack trace. */
export default function ErreurGlobale({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erreur-globale]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-1 items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Une erreur interne est survenue. Veuillez réessayer. Si le problème persiste, contactez
          l&apos;administrateur de la plateforme.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">Référence : {error.digest}</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset}>Réessayer</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            Retour à l&apos;accueil
          </Button>
        </div>
      </div>
    </div>
  );
}
