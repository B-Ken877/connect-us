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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, LoaderCircle, KeyRound } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { LIBELLES_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";
import { actionCreerUtilisateur, actionMajUtilisateur } from "@/server/actions/admin-actions";

interface UtilisateurLeger {
  id: string;
  name: string;
  email: string;
  role: RoleUtilisateur;
  active: boolean;
  createdAt: string;
}

/** Account administration: create users, change roles, reset, activate. */
export function GestionUtilisateurs({
  utilisateurs,
  utilisateurCourantId,
}: {
  utilisateurs: UtilisateurLeger[];
  utilisateurCourantId: string;
}) {
  const router = useRouter();
  const [ouvertCreer, setOuvertCreer] = useState(false);
  const [cible, setCible] = useState<UtilisateurLeger | null>(null);
  const [enCours, demarrer] = useTransition();

  // create form
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleUtilisateur>("AGENT");
  const [motDePasse, setMotDePasse] = useState("");

  // edit form
  const [nouveauRole, setNouveauRole] = useState<RoleUtilisateur>("AGENT");
  const [actif, setActif] = useState(true);
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");

  function creer() {
    demarrer(async () => {
      const r = await actionCreerUtilisateur({ name: nom, email, role, motDePasse, active: true });
      if (r.succes) {
        toast({ title: "Compte créé", description: `${nom} — ${LIBELLES_ROLE[role]}` });
        setNom("");
        setEmail("");
        setMotDePasse("");
        setRole("AGENT");
        setOuvertCreer(false);
        router.refresh();
      } else {
        toast({ title: "Création impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  function enregistrer() {
    if (!cible) return;
    demarrer(async () => {
      const r = await actionMajUtilisateur(cible.id, {
        role: nouveauRole,
        active: actif,
        ...(nouveauMotDePasse ? { motDePasse: nouveauMotDePasse } : {}),
      });
      if (r.succes) {
        toast({ title: "Compte mis à jour" });
        setCible(null);
        setNouveauMotDePasse("");
        router.refresh();
      } else {
        toast({ title: "Modification impossible", description: r.message, variant: "destructive" });
      }
    });
  }

  return (
    <div className="mb-6">
      <Dialog open={ouvertCreer} onOpenChange={setOuvertCreer}>
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> Créer un compte
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau compte</DialogTitle>
            <DialogDescription>Le mot de passe est stocké haché (bcrypt) — jamais en clair.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-nom">Nom complet *</Label>
              <Input id="u-nom" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">E-mail professionnel *</Label>
              <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@centre.fr" />
            </div>
            <div className="space-y-1.5">
              <Label>Rôle *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as RoleUtilisateur)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LIBELLES_ROLE) as RoleUtilisateur[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {LIBELLES_ROLE[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-mdp">Mot de passe initial * (8+ caractères, lettres + chiffres)</Label>
              <Input id="u-mdp" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOuvertCreer(false)}>
              Annuler
            </Button>
            <Button onClick={creer} disabled={enCours || !nom || !email || motDePasse.length < 8} className="gap-2">
              {enCours && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Créer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cible)} onOpenChange={(v) => !v && setCible(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier « {cible?.name} »</DialogTitle>
            <DialogDescription>
              Les changements de rôle et de statut sont journalisés dans le registre d&apos;audit.
            </DialogDescription>
          </DialogHeader>
          {cible && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <Select value={nouveauRole} onValueChange={(v) => setNouveauRole(v as RoleUtilisateur)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LIBELLES_ROLE) as RoleUtilisateur[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {LIBELLES_ROLE[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Compte actif</p>
                  <p className="text-xs text-muted-foreground">Un compte désactivé ne peut plus se connecter.</p>
                </div>
                <Switch checked={actif} onCheckedChange={setActif} aria-label="Compte actif" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-mdp-reset">Réinitialiser le mot de passe (facultatif)</Label>
                <div className="flex gap-2">
                  <KeyRound className="mt-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="u-mdp-reset"
                    type="password"
                    value={nouveauMotDePasse}
                    onChange={(e) => setNouveauMotDePasse(e.target.value)}
                    placeholder="Nouveau mot de passe"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCible(null)}>
              Annuler
            </Button>
            <Button onClick={enregistrer} disabled={enCours} className="gap-2">
              {enCours && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {utilisateurs.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => {
              setCible(u);
              setNouveauRole(u.role);
              setActif(u.active);
              setNouveauMotDePasse("");
            }}
            className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-900">{u.name}</p>
              {!u.active && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Inactif</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{u.email}</p>
            <p className="mt-2 text-xs font-medium text-primary">{LIBELLES_ROLE[u.role]}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
