"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { KeyRound, LoaderCircle, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { actionReinitialiserMotDePasse } from "@/server/actions/admin-actions";

export function ReinitialiserMotDePasse({ utilisateurId }: { utilisateurId: string }) {
  const [enCours, demarrer] = useTransition();
  const [motDePasse, setMotDePasse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  function executer() {
    setErreur(null);
    setMotDePasse(null);
    demarrer(async () => {
      const res = await actionReinitialiserMotDePasse(utilisateurId);
      if (!res.succes) {
        setErreur(res.message ?? "Une erreur est survenue.");
        return;
      }
      setMotDePasse(res.data!.motDePasseTemporaire);
    });
  }

  function copier() {
    if (!motDePasse) return;
    navigator.clipboard.writeText(motDePasse);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  if (motDePasse) {
    return (
      <div className="flex items-center gap-2">
        <Alert className="flex-1 border-amber-200 bg-amber-50 py-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-700" />
            <AlertDescription className="font-mono text-sm text-amber-900">
              {motDePasse}
            </AlertDescription>
            <Button size="sm" variant="ghost" onClick={copier} className="h-7 px-2">
              {copie ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </Alert>
        <Button size="sm" variant="outline" onClick={() => setMotDePasse(null)}>
          Fermer
        </Button>
      </div>
    );
  }

  return (
    <AlertDialog open={ouvert} onOpenChange={setOuvert}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1 text-xs">
          <KeyRound className="h-3 w-3" />
          Réinitialiser
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Réinitialiser le mot de passe</AlertDialogTitle>
          <AlertDialogDescription>
            Un nouveau mot de passe temporaire sera généré. L&apos;agent devra le changer à sa prochaine connexion.
            Le mot de passe ne sera affiché qu&apos;une seule fois — copiez-le immédiatement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {erreur && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enCours}>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={executer} disabled={enCours}>
            {enCours ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Génération…
              </>
            ) : (
              "Générer le mot de passe"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
