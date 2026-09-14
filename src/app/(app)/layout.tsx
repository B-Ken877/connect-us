import { redirect } from "next/navigation";
import { lireSession, utilisateurCourant, detruireSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/app-shell";
import { verifierAccesShift } from "@/lib/shifts";
import { enregistrerAudit } from "@/lib/audit";

/**
 * Authenticated area layout. Middleware already blocks unauthenticated access;
 * this re-verifies server-side (defense in depth) and renders the role-aware
 * navigation shell.
 *
 * Gardes supplémentaires :
 *  - Si l'utilisateur doit changer son mot de passe → /changer-mot-de-passe
 *  - Si l'agent est hors shift → déconnexion automatique + message
 *    (déclenché à chaque navigation si le shift vient de se terminer)
 */
export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  const session = await lireSession();
  if (!session) redirect("/connexion?expiree=1");

  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?expiree=1");
  if (utilisateur.mustChangePassword) redirect("/changer-mot-de-passe");

  // UNITED Research — vérification du shift à chaque navigation.
  // Si l'agent est hors shift (shift terminé), on le déconnecte automatiquement
  // avec un message clair. Il ne pourra pas se reconnecter avant son prochain shift.
  const verifShift = verifierAccesShift(utilisateur.name, utilisateur.role);
  if (!verifShift.autorise) {
    await enregistrerAudit({
      userId: utilisateur.id,
      action: "DECONNEXION_FIN_SHIFT",
      entityType: "User",
      entityId: utilisateur.id,
      metadata: { shift: verifShift.shift?.id },
    });
    await detruireSession();
    redirect(`/connexion?shiftTermine=1&shiftLibelle=${encodeURIComponent(verifShift.shift?.libelle ?? "")}&prochainDebut=${encodeURIComponent(verifShift.shift ? `${String(verifShift.shift.heureDebut).padStart(2, "0")}:${String(verifShift.shift.minuteDebut).padStart(2, "0")}` : "")}`);
  }

  return <AppShell nom={session.nom} role={session.role}>{children}</AppShell>;
}
