"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoaderCircle, Save, Eye, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { actionMajScript } from "@/server/actions/survey-actions";

interface EditeurScriptProps {
  enqueteId: string;
  scriptInitial?: string | null;
  candidatInitial?: string | null;
  instructionsInitiales?: string | null;
  conformiteInitiale?: string | null;
  contactInitial?: string | null;
}

export function EditeurScript({
  enqueteId,
  scriptInitial,
  candidatInitial,
  instructionsInitiales,
  conformiteInitiale,
  contactInitial,
}: EditeurScriptProps) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);
  const [script, setScript] = useState(scriptInitial ?? "");
  const [candidat, setCandidat] = useState(candidatInitial ?? "");
  const [instructions, setInstructions] = useState(instructionsInitiales ?? "");
  const [conformite, setConformite] = useState(conformiteInitiale ?? "");
  const [contact, setContact] = useState(contactInitial ?? "");

  function soumettre() {
    setMessage(null);
    demarrer(async () => {
      const res = await actionMajScript({
        enqueteId,
        openingScript: script,
        candidateName: candidat,
        campaignInstructions: instructions,
        complianceMessage: conformite,
        contactInfo: contact,
      });
      if (!res.succes) {
        setMessage({ type: "erreur", texte: res.message ?? "Erreur lors de l'enregistrement." });
      } else {
        setMessage({ type: "succes", texte: res.message ?? "Script enregistré." });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Script d&apos;introduction & informations de campagne
        </CardTitle>
        <CardDescription>
          Le script est lu par l&apos;agent en début d&apos;appel. Il s&apos;affiche en grand dans l&apos;espace agent.
          Modifiable à tout moment (journalisé dans l&apos;audit).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <Alert
            className={`mb-4 ${
              message.type === "succes"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {message.type === "succes" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription>{message.texte}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="edition" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="edition" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Édition
            </TabsTrigger>
            <TabsTrigger value="apercu" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Aperçu agent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edition" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="candidat">Nom du candidat / campagne</Label>
              <Input
                id="candidat"
                value={candidat}
                onChange={(e) => setCandidat(e.target.value)}
                placeholder="Ex : Sénatrice Jane Doe — Sénat 2026"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="script">
                Script d&apos;introduction{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={12}
                className="font-mono text-sm leading-relaxed"
                placeholder={`Bonjour, je m'appelle [Nom de l'agent] et j'appelle de la part de UNITED Research.\n\nNous menons une campagne d'appels pour le compte de [Nom du candidat]. Puis-je parler avec [Nom du contact] ?\n\n...`}
              />
              <p className="text-xs text-muted-foreground">
                {script.length} caractères. Les sauts de ligne sont préservés dans l&apos;affichage agent.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions de campagne (optionnel)</Label>
                <Textarea
                  id="instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  placeholder="Consignes opérationnelles pour les agents..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conformite">Message de conformité (optionnel)</Label>
                <Textarea
                  id="conformite"
                  value={conformite}
                  onChange={(e) => setConformite(e.target.value)}
                  rows={4}
                  placeholder="Message d'opt-out / conformité légale..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact">Coordonnées de la campagne (optionnel)</Label>
              <Input
                id="contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Ex : UNITED Research — contact@united-research.ht"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={soumettre} disabled={enCours || script.trim().length < 10}>
                {enCours ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Enregistrer le script
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="apercu">
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4">
                <p className="libelle-section mb-1">Aperçu — ce que verra l&apos;agent</p>
                {candidat && (
                  <h3 className="text-lg font-semibold text-foreground">{candidat}</h3>
                )}
              </div>
              <div className="prose prose-slate max-w-none">
                {script ? (
                  script.split("\n").map((ligne, i) => (
                    <p key={i} className="mb-3 text-base leading-relaxed text-foreground">
                      {ligne || "\u00A0"}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground italic">Aucun script défini.</p>
                )}
              </div>
              {conformite && (
                <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-900">{conformite}</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
