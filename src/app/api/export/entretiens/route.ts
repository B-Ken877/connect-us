import { NextRequest, NextResponse } from "next/server";
import { exigerRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { enregistrerAudit, ACTIONS_AUDIT } from "@/lib/audit";
import { versMessageUtilisateur } from "@/lib/errors";
import { construireExportEntretiens, nomFichierExport, versCsv } from "@/lib/export/csv";
import type { QuestionDef, ReponsesParCle } from "@/lib/survey-engine";
import { depuisColonnes } from "@/lib/survey-engine";

/**
 * CSV export of survey responses — GESTIONNAIRE / ADMINISTRATEUR only.
 * The action is audited. PII columns (référence externe) require the
 * explicit `inclureIdentite=1` flag and are audited as well.
 */
export async function GET(request: NextRequest) {
  try {
    const utilisateur = await exigerRole(["ADMINISTRATEUR", "GESTIONNAIRE"]);
    const versionId = request.nextUrl.searchParams.get("versionId");
    if (!versionId) {
      return NextResponse.json({ erreur: "Paramètre versionId requis." }, { status: 400 });
    }
    const inclureIdentite = request.nextUrl.searchParams.get("inclureIdentite") === "1";

    const version = await db.surveyVersion.findUnique({
      where: { id: versionId },
      include: {
        survey: { select: { title: true } },
        questions: { include: { options: true }, orderBy: { order: "asc" } },
      },
    });
    if (!version) {
      return NextResponse.json({ erreur: "Version introuvable." }, { status: 404 });
    }

    const entretiens = await db.interview.findMany({
      where: { surveyVersionId: versionId, status: "TERMINE" },
      orderBy: { completedAt: "asc" },
      include: {
        agent: { select: { name: true } },
        respondent: { select: { id: true, externalRef: true } },
        answers: true,
      },
    });

    const questions = version.questions as unknown as QuestionDef[];
    const donnees = entretiens.map((e) => {
      const reponses: ReponsesParCle = {};
      for (const a of e.answers) {
        reponses[a.questionKey] = depuisColonnes(a);
      }
      return {
        interview: {
          id: e.id,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          durationSeconds: e.durationSeconds,
          status: e.status,
          qualityStatus: e.qualityStatus,
          agent: e.agent,
          respondent: e.respondent,
        },
        reponses,
      };
    });

    const lignes = construireExportEntretiens({ questions, entretiens: donnees, inclureIdentite });
    const csv = versCsv(lignes);

    await enregistrerAudit({
      userId: utilisateur.id,
      action: ACTIONS_AUDIT.EXPORT_REPONSES,
      entityType: "SurveyVersion",
      entityId: versionId,
      metadata: { entretiens: entretiens.length, inclureIdentite },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichierExport(version.survey.title, version.versionNumber)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erreur) {
    const message = versMessageUtilisateur(erreur);
    const statut = message.includes("session") ? 401 : message.includes("autoris") ? 403 : 500;
    return NextResponse.json({ erreur: message }, { status: statut });
  }
}
