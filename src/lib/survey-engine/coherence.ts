import type {
  ConfigurationVersion,
  ConditionAffichage,
  QuestionDef,
  ReponsesParCle,
} from "@/lib/survey-engine/types";
import { evaluerCondition } from "@/lib/survey-engine/visibility";

/**
 * Logical-coherence evaluation (declarative incompatibility rules configured
 * on the survey version). Example: "age < 16" incompatible with "emploi = Oui"
 * → the interview is FLAGGED (INCOHERENCE), never silently rejected — the
 * supervisor decides.
 */

export interface ViolationCoherence {
  regleId: string;
  message: string;
}

export function evaluerCoherence(
  _questions: QuestionDef[],
  reponses: ReponsesParCle,
  configuration: ConfigurationVersion | null | undefined,
): ViolationCoherence[] {
  const regles = configuration?.reglesCoherence ?? [];
  const violations: ViolationCoherence[] = [];

  for (const regle of regles) {
    if (!regle?.si || !regle?.alorsIncompatibleAvec) continue;
    const siVraie = evaluerCondition(regle.si as ConditionAffichage, reponses);
    if (!siVraie) continue;
    const incompatibleVraie = evaluerCondition(regle.alorsIncompatibleAvec as ConditionAffichage, reponses);
    if (incompatibleVraie) {
      violations.push({ regleId: regle.id, message: regle.message });
    }
  }
  return violations;
}

/**
 * Deterministic answer-signature used by the quality engine to detect agents
 * submitting many interviews with identical answer patterns.
 * Only closed questions (choices / boolean / number / scale) participate —
 * free text would make every signature unique.
 */
export function signatureReponses(reponses: ReponsesParCle): string {
  const morceaux: string[] = [];
  for (const [cle, valeur] of Object.entries(reponses)) {
    const parties: string[] = [];
    if (valeur.choix && valeur.choix.length > 0) parties.push(`c:${[...valeur.choix].sort().join("+")}`);
    if (valeur.booleen !== undefined) parties.push(`b:${valeur.booleen ? "1" : "0"}`);
    if (valeur.nombre !== undefined) parties.push(`n:${valeur.nombre}`);
    if (parties.length > 0) morceaux.push(`${cle}=${parties.join("|")}`);
  }
  return morceaux.sort().join(";");
}
