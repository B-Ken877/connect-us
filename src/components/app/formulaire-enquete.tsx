"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { actionCreerEnquete } from "@/server/actions/survey-actions";

export function FormulaireEnquete() {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(formData: FormData) {
    setErreur(null);
    demarrer(async () => {
      const r = await actionCreerEnquete(formData);
      if (!r.succes) {
        setErreur(r.message ?? "Création impossible.");
        return;
      }
      if (r.data?.id) {
        toast({ title: "Enquête créée", description: "Ajoutez maintenant vos questions." });
        router.push(`/enquetes/${r.data.id}/edition`);
      }
    });
  }

  return (
    <Card className="max-w-xl border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Nouvelle enquête</CardTitle>
        <CardDescription>
          Une version 1 « brouillon » est créée automatiquement. Vous pourrez y ajouter des questions,
          prévisualiser, puis publier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={soumettre} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="titre">Titre de l&apos;enquête *</Label>
            <Input id="titre" name="titre" required placeholder="Ex. Enquête politique — Démonstration" maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (facultative)</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Objectif de l'étude, contexte méthodologique…"
              maxLength={2000}
            />
          </div>
          {erreur && <p className="text-sm font-medium text-red-600">{erreur}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={enCours} className="gap-2">
              {enCours && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Créer l&apos;enquête
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/enquetes")}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
