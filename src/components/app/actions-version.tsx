"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/hooks/use-toast";
import { LoaderCircle, Rocket, Copy, Archive, FileDown } from "lucide-react";
import {
  actionPublierVersion,
  actionCreerVersion,
  actionArchiverVersion,
} from "@/server/actions/survey-actions";

/**
 * Per-version actions with immutability-aware confirmations:
 * publishing freezes the version FOREVER (DB-enforced); further changes
 * require a new draft version.
 */
export function ActionsVersion({
  enqueteId,
  version,
  aBrouillon,
}: {
  enqueteId: string;
  version: { id: string; versionNumber: number; status: string };
  aBrouillon: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  function publier() {
    demarrer(async () => {
      const r = await actionPublierVersion(version.id);
      if (r.succes) {
        toast({
          title: `Version ${version.versionNumber} publiée`,
          description: "Cette version est désormais immuable et collecte les entretiens.",
        });
        router.refresh();
      } else {
        toast({ title: "Publication impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  function nouvelleVersion() {
    demarrer(async () => {
      const r = await actionCreerVersion(enqueteId);
      if (r.succes) {
        toast({ title: "Nouveau brouillon créé", description: "Clone de la dernière version — modifiez-le puis publiez." });
        router.push(`/enquetes/${enqueteId}/edition`);
        router.refresh();
      } else {
        toast({ title: "Action impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  function archiver() {
    demarrer(async () => {
      const r = await actionArchiverVersion(version.id);
      if (r.succes) {
        toast({ title: "Version archivée" });
        router.refresh();
      } else {
        toast({ title: "Action impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {version.status === "BROUILLON" && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" className="gap-1.5" disabled={enCours}>
              {enCours ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Publier
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publier la version {version.versionNumber} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Une fois publiée, cette version devient <strong>immuable</strong> : plus aucune
                question ne pourra y être modifiée (garantie au niveau de la base de données).
                Les agents interrogent immédiatement cette version. Pour évoluer, vous créerez une
                nouvelle version.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={publier}>Publier définitivement</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {version.status === "PUBLIEE" && !aBrouillon && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={nouvelleVersion} disabled={enCours}>
          {enCours ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          Nouvelle version
        </Button>
      )}

      {version.status === "PUBLIEE" && (
        <>
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={`/api/export/entretiens?versionId=${version.id}`}>
              <FileDown className="h-3.5 w-3.5" /> CSV
            </a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
                <Archive className="h-3.5 w-3.5" /> Archiver
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archiver la version {version.versionNumber} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  La version ne sera plus proposée aux nouveaux entretiens. Les données collectées
                  restent intactes et consultables.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={archiver}>Archiver</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
