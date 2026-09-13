-- ============================================================================
-- UNITED RESEARCH — PostgreSQL integrity guards
-- Applied AFTER `prisma db push`:
--   bunx prisma db execute --file prisma/guards.sql --schema prisma/schema.prisma
--
-- Enforces the NON-NEGOTIABLE immutability rule at the database level:
-- a published (PUBLIEE/ARCHIVEE) survey version can never have its content
-- modified, regardless of application bugs.
-- ============================================================================

-- 1) SurveyVersion: once published/archived, only archiving is allowed.
CREATE OR REPLACE FUNCTION gig_guard_survey_version() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'BROUILLON' THEN
    IF NEW.status = 'ARCHIVEE' AND OLD.status = 'PUBLIEE' THEN
      RETURN NEW; -- archivage autorisé
    END IF;
    RAISE EXCEPTION 'VERSION_IMMUTABLE: la version % de l''enquête est publiée et ne peut plus être modifiée.', OLD.versionNumber
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gig_guard_survey_version ON "SurveyVersion";
CREATE TRIGGER trg_gig_guard_survey_version
BEFORE UPDATE ON "SurveyVersion"
FOR EACH ROW EXECUTE FUNCTION gig_guard_survey_version();

-- 2) Questions: insert/update/delete allowed only while the parent version is BROUILLON.
CREATE OR REPLACE FUNCTION gig_guard_question() RETURNS trigger AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM "SurveyVersion" WHERE id = OLD."surveyVersionId";
  ELSE
    SELECT status INTO v_status FROM "SurveyVersion" WHERE id = NEW."surveyVersionId";
  END IF;
  IF v_status IS NOT NULL AND v_status <> 'BROUILLON' THEN
    RAISE EXCEPTION 'VERSION_IMMUTABLE: les questions d''une version publiée ne peuvent pas être modifiées (%).', TG_OP
      USING ERRCODE = 'raise_exception';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gig_guard_question ON "Question";
CREATE TRIGGER trg_gig_guard_question
BEFORE INSERT OR UPDATE OR DELETE ON "Question"
FOR EACH ROW EXECUTE FUNCTION gig_guard_question();

-- 3) QuestionOption: same protection.
CREATE OR REPLACE FUNCTION gig_guard_question_option() RETURNS trigger AS $$
DECLARE v_status text;
DECLARE v_question text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_question := OLD."questionId";
  ELSE
    v_question := NEW."questionId";
  END IF;
  SELECT sv.status INTO v_status
  FROM "Question" q JOIN "SurveyVersion" sv ON sv.id = q."surveyVersionId"
  WHERE q.id = v_question;
  IF v_status IS NOT NULL AND v_status <> 'BROUILLON' THEN
    RAISE EXCEPTION 'VERSION_IMMUTABLE: les options d''une version publiée ne peuvent pas être modifiées (%).', TG_OP
      USING ERRCODE = 'raise_exception';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gig_guard_question_option ON "QuestionOption";
CREATE TRIGGER trg_gig_guard_question_option
BEFORE INSERT OR UPDATE OR DELETE ON "QuestionOption"
FOR EACH ROW EXECUTE FUNCTION gig_guard_question_option();

-- 4) Un seul appel actif par agent (garantie d'intégrité au niveau base).
CREATE UNIQUE INDEX IF NOT EXISTS uq_appel_actif_par_agent
ON "CallAttempt"("agentId") WHERE status = 'EN_COURS';
