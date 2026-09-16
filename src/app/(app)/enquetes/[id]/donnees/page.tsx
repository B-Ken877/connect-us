import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAcces } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { EnTetePage, EtatVide } from "@/components/app/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateHeureFr, formatDuree, LIBELLES_STATUT_APPEL } from "@/lib/format";
import { ChevronLeft, BarChart3, Users, PhoneCall, CheckCircle2, Ban, FileDown } from "lucide-react";

export const metadata = { title: "Données collectées — UNITED Research" };
export const dynamic = "force-dynamic";

export default async function PageDonnees({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerAcces(["ADMINISTRATEUR"]);
  const { id } = await params;

  const enquete = await db.survey.findUnique({
    where: { id },
    include: {
      versions: {
        where: { status: "PUBLIEE" },
        orderBy: { versionNumber: "desc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { options: { orderBy: { order: "asc" } } },
          },
          interviews: {
            where: { status: "TERMINE" },
            orderBy: { completedAt: "desc" },
            include: {
              agent: { select: { name: true } },
              respondent: { select: { name: true, phone: true } },
              callAttempt: { select: { status: true, durationSeconds: true, notes: true } },
              answers: { include: { question: { select: { key: true, text: true, type: true, options: { select: { label: true, value: true } } } } } },
            },
          },
        },
      },
    },
  });

  if (!enquete) notFound();

  // Rassembler tous les entretiens terminés de toutes les versions publiées
  const tousEntretiens = enquete.versions.flatMap((v) =>
    v.interviews.map((i) => ({ ...i, versionNumber: v.versionNumber })),
  );

  // Rassembler toutes les questions (de la dernière version publiée)
  const derniereVersion = enquete.versions[0];
  const questions = derniereVersion?.questions ?? [];

  // Statistiques globales
  const totalAppels = tousEntretiens.length;
  const totalContacts = await db.respondent.count();
  const optOuts = await db.callAttempt.count({ where: { status: "NE_PAS_RAPPELER" } });

  // Pour chaque question, calculer la distribution des réponses
  const distributionParQuestion = questions.map((q) => {
    const reponses: Record<string, number> = {};
    let sansReponse = 0;

    for (const entretien of tousEntretiens) {
      const answer = entretien.answers.find((a) => a.question.key === q.key);
      if (!answer || !answer.choiceValues || answer.choiceValues.length === 0) {
        sansReponse++;
        continue;
      }
      const valeur = answer.choiceValues[0];
      reponses[valeur] = (reponses[valeur] ?? 0) + 1;
    }

    // Mapper les valeurs vers les libellés des options
    const optionsMap = new Map(q.options.map((o) => [o.value, o.label]));
    const distribution = q.options.map((opt) => ({
      label: opt.label,
      value: opt.value,
      count: reponses[opt.value] ?? 0,
      pourcentage: totalAppels > 0 ? Math.round(((reponses[opt.value] ?? 0) / totalAppels) * 100) : 0,
    }));

    // Réponses hors options prédéfinies (si applicable)
    const autresValeurs = Object.entries(reponses)
      .filter(([v]) => !optionsMap.has(v))
      .map(([v, c]) => ({ valeur: v, count: c }));

    return { question: q, distribution, sansReponse, autresValeurs };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Link href={`/enquetes/${enquete.id}`}>
            <ChevronLeft className="h-4 w-4" /> Retour à la campagne
          </Link>
        </Button>
      </div>

      <EnTetePage
        titre={`Données collectées — ${enquete.title}`}
        description="Synthèse des réponses collectées et liste des appels terminés pour cette campagne."
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link href={`/entretiens?statut=TERMINE`}>
              <FileDown className="h-4 w-4" /> Voir toutes les fiches
            </Link>
          </Button>
        }
      />

      {/* Cartes statistiques */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <PhoneCall className="h-4 w-4" />
              <p className="libelle-section">Appels terminés</p>
            </div>
            <p className="chiffre-cle mt-2 text-2xl font-semibold text-foreground">{totalAppels}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <p className="libelle-section">Contacts au total</p>
            </div>
            <p className="chiffre-cle mt-2 text-2xl font-semibold text-foreground">{totalContacts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <p className="libelle-section">Taux de complétion</p>
            </div>
            <p className="chiffre-cle mt-2 text-2xl font-semibold text-foreground">
              {totalContacts > 0 ? Math.round((totalAppels / totalContacts) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Ban className="h-4 w-4" />
              <p className="libelle-section">Demandes ne plus appeler</p>
            </div>
            <p className="chiffre-cle mt-2 text-2xl font-semibold text-destructive">{optOuts}</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution des réponses par question */}
      {distributionParQuestion.length === 0 ? (
        <EtatVide titre="Aucune question" description="Cette campagne n'a pas encore de questions publiées." />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Distribution des réponses</h2>
          </div>

          {distributionParQuestion.map(({ question, distribution, sansReponse }) => (
            <Card key={question.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {question.text}
                  {question.required && <span className="ml-1 text-destructive">*</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {totalAppels === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun appel terminé pour le moment.</p>
                ) : (
                  <div className="space-y-2">
                    {distribution.map((opt) => (
                      <div key={opt.value} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-sm font-medium text-foreground">
                          {opt.label}
                        </div>
                        <div className="flex-1">
                          <div className="h-6 rounded-md bg-muted/30 overflow-hidden">
                            <div
                              className="h-full bg-primary/70 transition-all"
                              style={{ width: `${opt.pourcentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-20 shrink-0 text-right text-sm">
                          <span className="font-semibold text-foreground">{opt.count}</span>
                          <span className="text-muted-foreground"> ({opt.pourcentage}%)</span>
                        </div>
                      </div>
                    ))}
                    {sansReponse > 0 && (
                      <div className="flex items-center gap-3 pt-2 border-t border-border">
                        <div className="w-32 shrink-0 text-sm text-muted-foreground">Sans réponse</div>
                        <div className="flex-1" />
                        <div className="w-20 shrink-0 text-right text-sm text-muted-foreground">
                          {sansReponse}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Liste des appels terminés */}
      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Appels terminés ({tousEntretiens.length})
        </h2>
        {tousEntretiens.length === 0 ? (
          <EtatVide titre="Aucun appel terminé" description="Les appels terminés apparaîtront ici automatiquement." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="overflow-x-auto scroll-fin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="hidden md:table-cell">Résultat</TableHead>
                    <TableHead className="hidden lg:table-cell">Durée</TableHead>
                    <TableHead className="text-right">Détail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tousEntretiens.slice(0, 50).map((entretien) => (
                    <TableRow key={entretien.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateHeureFr(entretien.completedAt)}
                      </TableCell>
                      <TableCell className="text-sm">{entretien.agent.name}</TableCell>
                      <TableCell className="text-sm">
                        {entretien.respondent.name ?? <span className="font-mono text-xs text-muted-foreground">#{entretien.respondent.phone.slice(-4)}</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {entretien.callAttempt && (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            {LIBELLES_STATUT_APPEL[entretien.callAttempt.status] ?? entretien.callAttempt.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {entretien.durationSeconds ? formatDuree(entretien.durationSeconds) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/entretiens/${entretien.id}`}>Voir le détail</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
