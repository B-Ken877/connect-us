import { redirect } from "next/navigation";
import { lireSession, utilisateurCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/app/app-shell";

/**
 * Authenticated area layout. Middleware already blocks unauthenticated access;
 * this re-verifies server-side (defense in depth) and renders the role-aware
 * navigation shell.
 *
 * Garde supplémentaire : si l'utilisateur doit changer son mot de passe
 * (mustChangePassword=true), on le redirige vers /changer-mot-de-passe
 * avant de lui donner accès à l'application.
 */
export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  const session = await lireSession();
  if (!session) redirect("/connexion?expiree=1");

  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion?expiree=1");
  if (utilisateur.mustChangePassword) redirect("/changer-mot-de-passe");

  return <AppShell nom={session.nom} role={session.role}>{children}</AppShell>;
}
