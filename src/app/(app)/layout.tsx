import { redirect } from "next/navigation";
import { lireSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/app-shell";

/**
 * Authenticated area layout. Middleware already blocks unauthenticated access;
 * this re-verifies server-side (defense in depth) and renders the role-aware
 * navigation shell.
 */
export default async function LayoutApplication({ children }: { children: React.ReactNode }) {
  const session = await lireSession();
  if (!session) redirect("/connexion?expiree=1");

  return <AppShell nom={session.nom} role={session.role}>{children}</AppShell>;
}
