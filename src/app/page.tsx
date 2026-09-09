import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth/session";
import { ACCUEIL_PAR_ROLE, type RoleUtilisateur } from "@/lib/auth/permissions";

/** Entry point: routes each role to its home console (or the login page). */
export default async function Accueil() {
  const session = await lireSession();
  if (!session) redirect("/connexion");
  redirect(ACCUEIL_PAR_ROLE[session.role as RoleUtilisateur]);
}
