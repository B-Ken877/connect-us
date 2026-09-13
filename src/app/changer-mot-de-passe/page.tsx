import { ChangerMotDePasseForm } from "@/components/app/changer-mot-de-passe-form";
import { lireSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Changement de mot de passe — UNITED Research" };

export default async function PageChangerMotDePasse() {
  const session = await lireSession();
  if (!session) redirect("/connexion?expiree=1");

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            UNITED Research
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sécurité du compte
          </p>
        </div>
        <ChangerMotDePasseForm />
      </div>
    </main>
  );
}
