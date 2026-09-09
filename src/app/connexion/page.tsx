import { Suspense } from "react";
import { ConnexionForm } from "@/components/app/connexion-form";

export const metadata = { title: "Connexion — GIG Survey" };

export default function PageConnexion() {
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">GIG Survey</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plateforme d&apos;enquêtes téléphoniques — Centre d&apos;études d&apos;opinion
          </p>
        </div>
        <Suspense>
          <ConnexionForm />
        </Suspense>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Accès réservé au personnel du centre. Toute activité est journalisée.
        </p>
      </div>
    </main>
  );
}
