import Link from "next/link";

export default function PageIntrouvable() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <p className="chiffre-cle text-5xl font-semibold text-slate-300">404</p>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La page demandée n&apos;existe pas ou n&apos;est plus accessible.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
