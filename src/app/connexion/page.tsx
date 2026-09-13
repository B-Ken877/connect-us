import { Suspense } from "react";
import { ConnexionForm } from "@/components/app/connexion-form";

export const metadata = { title: "Connexion — UNITED Research" };

export default function PageConnexion() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* logo statique — pas besoin d'optimisation next/image */}
          <img
            src="/united-research-logo-trim.png"
            alt="UNITED Research"
            width={260}
            height={82}
            className="h-auto w-[260px] max-w-full"
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Plateforme d&apos;appels et de recherche
          </p>
        </div>
        <Suspense>
          <ConnexionForm />
        </Suspense>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Accès réservé au personnel autorisé. Toute activité est journalisée.
        </p>
      </div>
    </main>
  );
}
