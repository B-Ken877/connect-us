import { exigerAcces } from "@/lib/auth/session";
import { EnTetePage } from "@/components/app/primitives";
import { FormulaireEnquete } from "@/components/app/formulaire-enquete";

export const metadata = { title: "Nouvelle enquête — UNITED Research" };

export default async function PageNouvelleEnquete() {
  await exigerAcces(["ADMINISTRATEUR"]);
  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage titre="Créer une enquête" description="Les questionnaires sont construits sans intervention technique." />
      <FormulaireEnquete />
    </div>
  );
}
