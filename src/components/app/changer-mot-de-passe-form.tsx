"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoaderCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { changerMonMotDePasse, type ResultatAction } from "@/server/actions/auth-actions";

export function ChangerMotDePasseForm() {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);
  const [enCours, demarrer] = useTransition();

  function soumettre(formData: FormData) {
    setErreur(null);
    setSucces(false);
    demarrer(async () => {
      const resultat: ResultatAction = await changerMonMotDePasse(null, formData);
      if (!resultat.succes) {
        setErreur(resultat.message ?? "Une erreur est survenue.");
        return;
      }
      setSucces(true);
      // Rediriger vers la page d'accueil du rôle après 1,5 s.
      // On utilise router.replace("/") — la route "/" est redirigée par le proxy
      // vers la page d'accueil du rôle (tableau-de-bord pour admin, session pour agent).
      // router.refresh() seul ne changeait pas l'URL → l'utilisateur restait bloqué.
      setTimeout(() => router.replace("/"), 1500);
    });
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <CardTitle className="text-lg">Changement de mot de passe obligatoire</CardTitle>
        <CardDescription>
          Pour votre sécurité, vous devez définir un nouveau mot de passe avant de continuer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {succes && (
          <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-900">
            <ShieldCheck className="h-4 w-4" />
            <AlertDescription>
              Mot de passe modifié avec succès. Redirection en cours…
            </AlertDescription>
          </Alert>
        )}
        {erreur && !succes && (
          <Alert variant="destructive" className="mb-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <form action={soumettre} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="motDePasseActuel">Mot de passe actuel</Label>
            <Input
              id="motDePasseActuel"
              name="motDePasseActuel"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Saisissez le mot de passe temporaire fourni par l&apos;administrateur.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nouveauMotDePasse">Nouveau mot de passe</Label>
            <Input
              id="nouveauMotDePasse"
              name="nouveauMotDePasse"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">
              Au moins 8 caractères, contenant des lettres et des chiffres.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation">Confirmer le nouveau mot de passe</Label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Modification…
              </>
            ) : (
              "Définir mon nouveau mot de passe"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
