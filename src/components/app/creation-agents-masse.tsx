"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoaderCircle, Users, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { actionCreerAgentsEnMasse, type AgentCreeEnMasse } from "@/server/actions/admin-actions";

export function CreationAgentsEnMasse() {
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ agents: AgentCreeEnMasse[]; crees: number } | null>(null);

  function soumettre(formData: FormData) {
    setErreur(null);
    setResultat(null);
    demarrer(async () => {
      const params = {
        prefixe: String(formData.get("prefixe") ?? "agent"),
        nombre: Number(formData.get("nombre") ?? 10),
        domaine: String(formData.get("domaine") ?? "united-research.ht"),
        motDePasseTemporaire: String(formData.get("motDePasseTemporaire") ?? ""),
      };
      const res = await actionCreerAgentsEnMasse(params);
      if (!res.succes) {
        setErreur(res.message ?? "Une erreur est survenue.");
        return;
      }
      setResultat(res.data!);
    });
  }

  function telechargerCSV() {
    if (!resultat) return;
    const lignes = ["username,email,mot_de_passe"];
    for (const a of resultat.agents) {
      lignes.push(`${a.username},${a.email},${a.motDePasseTemporaire}`);
    }
    const csv = lignes.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agents-united-research-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Users className="h-4 w-4" />
          Créer des agents en masse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Créer des agents en masse</DialogTitle>
          <DialogDescription>
            Génère N comptes agents (agent001, agent002, …) avec un mot de passe temporaire partagé.
            Chaque agent devra changer son mot de passe à la première connexion.
          </DialogDescription>
        </DialogHeader>

        {resultat ? (
          <div className="space-y-4">
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <strong>{resultat.crees} comptes agents créés avec succès.</strong>
                <br />
                Téléchargez la liste des identifiants maintenant — le mot de passe temporaire ne sera plus jamais affiché.
              </AlertDescription>
            </Alert>
            <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Identifiant</th>
                    <th className="px-3 py-2 text-left font-medium">E-mail</th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.agents.slice(0, 20).map((a) => (
                    <tr key={a.username} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono">{a.username}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{a.email}</td>
                    </tr>
                  ))}
                  {resultat.agents.length > 20 && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={2} className="px-3 py-2 text-center text-muted-foreground">
                        … et {resultat.agents.length - 20} autres (voir le CSV)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={telechargerCSV} className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger le CSV
              </Button>
              <Button
                onClick={() => {
                  setResultat(null);
                  setOuvert(false);
                }}
              >
                Terminer
              </Button>
            </div>
          </div>
        ) : (
          <form action={soumettre} className="space-y-4">
            {erreur && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prefixe">Préfixe</Label>
                <Input id="prefixe" name="prefixe" defaultValue="agent" required />
                <p className="text-xs text-muted-foreground">Ex: « agent » → agent001, agent002, …</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre d&apos;agents</Label>
                <Input id="nombre" name="nombre" type="number" min={1} max={500} defaultValue={100} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="domaine">Domaine e-mail</Label>
              <Input id="domaine" name="domaine" defaultValue="united-research.ht" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="motDePasseTemporaire">Mot de passe temporaire (partagé)</Label>
              <Input
                id="motDePasseTemporaire"
                name="motDePasseTemporaire"
                type="text"
                required
                minLength={8}
                placeholder="Au moins 8 caractères, lettres + chiffres"
              />
              <p className="text-xs text-muted-foreground">
                Tous les agents recevront ce mot de passe temporaire et devront le changer à la première connexion.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOuvert(false)} disabled={enCours}>
                Annuler
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Création…
                  </>
                ) : (
                  "Créer les agents"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
