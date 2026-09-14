"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoaderCircle, ShieldAlert, Clock } from "lucide-react";
import { seConnecter, type ResultatAction } from "@/server/actions/auth-actions";

export function ConnexionForm() {
  const router = useRouter();
  const parametres = useSearchParams();
  const expiree = parametres.get("expiree") === "1";
  const shiftTermine = parametres.get("shiftTermine") === "1";
  const shiftLibelle = parametres.get("shiftLibelle") ?? "";
  const prochainDebut = parametres.get("prochainDebut") ?? "";
  const ipRefusee = parametres.get("ipRefusee") === "1";
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function soumettre(formData: FormData) {
    setErreur(null);
    demarrer(async () => {
      const resultat: ResultatAction = await seConnecter(null, formData);
      if (!resultat.succes && resultat.message) {
        setErreur(resultat.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Connexion à la plateforme</CardTitle>
        <CardDescription>Utilisez les identifiants fournis par l&apos;administrateur.</CardDescription>
      </CardHeader>
      <CardContent>
        {shiftTermine && !erreur && (
          <Alert className="mb-4 border-primary bg-primary/5 text-primary">
            <Clock className="h-4 w-4" />
            <AlertDescription>
              <strong>Votre shift est terminé.</strong>
              {shiftLibelle && <><br />Shift : {shiftLibelle}</>}
              {prochainDebut && (
                <>
                  <br />Vous pourrez vous reconnecter demain à{" "}
                  <strong>{prochainDebut} EST</strong>.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}
        {expiree && !erreur && !shiftTermine && !ipRefusee && (
          <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>Votre session a expiré. Veuillez vous reconnecter.</AlertDescription>
          </Alert>
        )}
        {ipRefusee && !erreur && (
          <Alert variant="destructive" className="mb-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              <strong>Connexion interrompue.</strong> Cette adresse IP n&apos;est plus autorisée
              pour votre compte. Contactez l&apos;administrateur.
            </AlertDescription>
          </Alert>
        )}
        {erreur && (
          <Alert variant="destructive" className="mb-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <form action={soumettre} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="prenom.nom@centre.fr"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="motDePasse">Mot de passe</Label>
            <Input
              id="motDePasse"
              name="motDePasse"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Connexion…
              </>
            ) : (
              "Se connecter"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
