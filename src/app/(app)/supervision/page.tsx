import { exigerAcces } from "@/lib/auth/session";
import { statistiquesSupervision } from "@/server/services/stats-service";
import { ConsoleSupervision } from "@/components/app/console-supervision";
import { EnTetePage } from "@/components/app/primitives";

export const metadata = { title: "Tableau de supervision — GIG Survey" };
export const dynamic = "force-dynamic";

export default async function PageSupervision() {
  await exigerAcces(["ADMINISTRATEUR", "SUPERVISEUR"]);
  const stats = await statistiquesSupervision();

  return (
    <div className="mx-auto max-w-6xl">
      <EnTetePage
        titre="Tableau de supervision"
        description="Activité opérationnelle du plateau d'appels : présence des agents, production et signalements qualité."
      />
      <ConsoleSupervision donneesInitiales={stats} />
    </div>
  );
}
