"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Upload, LoaderCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { actionCreerRepondant, actionImporterRepondants } from "@/server/actions/admin-actions";

/** Respondent pool: single add + bulk import (one "Nom;Téléphone" per line). */
export function FormulaireRepondant() {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, demarrer] = useTransition();

  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [reference, setReference] = useState("");
  const [importContenu, setImportContenu] = useState("");

  function ajouterUn() {
    demarrer(async () => {
      const r = await actionCreerRepondant({ name: nom, phone: telephone, externalRef: reference });
      if (r.succes) {
        toast({ title: "Répondant ajouté" });
        setNom("");
        setTelephone("");
        setReference("");
        setOuvert(false);
        router.refresh();
      } else {
        toast({ title: "Ajout impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  function importer() {
    demarrer(async () => {
      const r = await actionImporterRepondants(importContenu);
      if (r.succes && r.data) {
        toast({
          title: "Import terminé",
          description: `${r.data.crees} répondant(s) créé(s) sur ${r.data.soumis} ligne(s) valide(s).`,
        });
        setImportContenu("");
        setOuvert(false);
        router.refresh();
      } else {
        toast({ title: "Import impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Ajouter des répondants
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter des répondants</DialogTitle>
          <DialogDescription>
            Saisie individuelle ou import en masse. Les doublons (même numéro) sont ignorés.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="unite">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="unite">À l&apos;unité</TabsTrigger>
            <TabsTrigger value="import">Import en masse</TabsTrigger>
          </TabsList>

          <TabsContent value="unite" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="rep-nom">Nom (facultatif)</Label>
              <Input id="rep-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-tel">Téléphone *</Label>
              <Input id="rep-tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="06 12 34 56 78" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-ref">Référence externe (facultative)</Label>
              <Input id="rep-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex. PANEL-2026-0042" />
            </div>
            <DialogFooter>
              <Button onClick={ajouterUn} disabled={enCours || telephone.trim().length < 6} className="gap-2">
                {enCours && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Ajouter
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="import" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="rep-import">Liste (une ligne par répondant)</Label>
              <Textarea
                id="rep-import"
                rows={8}
                value={importContenu}
                onChange={(e) => setImportContenu(e.target.value)}
                placeholder={"Nom;Téléphone\nMarie Dupont;06 11 22 33 44\nJean Martin;07 55 66 77 88"}
                className="font-mono text-sm"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Upload className="h-3 w-3" /> Séparateurs acceptés : point-virgule, virgule ou tabulation.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={importer} disabled={enCours || !importContenu.trim()} className="gap-2">
                {enCours && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Importer
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
