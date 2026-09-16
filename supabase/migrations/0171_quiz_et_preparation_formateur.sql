-- Préparer son cours depuis l'espace formateur : exercices et quiz.
--
-- Les exercices existent depuis la 0080, avec rendus et correction à la main.
-- Deux manques : le formateur externe n'y avait aucun accès (policies réservées
-- aux membres), et rien ne permettait de poser un quiz à correction automatique
-- — l'outil le plus demandé pour vérifier un acquis en fin de séance.
--
-- Un quiz est un exercice d'une autre nature, pas une table de plus : même
-- publication, même rendu, même notation, même espace apprenant.

-- ── 1. Le quiz, variante de l'exercice ──────────────────────────────────────

ALTER TABLE app.exercises
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'devoir'
    CHECK (kind IN ('devoir', 'quiz')),
  -- [{ id, enonce, choix: [...], bonnes: [index...], points }]
  ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Rattachement facultatif à une séance : « le quiz de fin de journée ».
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES app.sessions(id) ON DELETE SET NULL,
  -- Seuil de réussite en pourcentage. NULL = pas de seuil, seule la note compte.
  ADD COLUMN IF NOT EXISTS pass_score NUMERIC(5, 2)
    CHECK (pass_score IS NULL OR (pass_score >= 0 AND pass_score <= 100));

-- Un quiz sans question ne peut pas être corrigé : il n'a pas à exister.
ALTER TABLE app.exercises DROP CONSTRAINT IF EXISTS exercises_quiz_a_des_questions;
ALTER TABLE app.exercises ADD CONSTRAINT exercises_quiz_a_des_questions
  CHECK (kind <> 'quiz' OR jsonb_array_length(questions) > 0);

CREATE INDEX IF NOT EXISTS ix_exercises_session
  ON app.exercises (session_id) WHERE session_id IS NOT NULL AND deleted_at IS NULL;

-- ── 2. Le rendu d'un quiz ───────────────────────────────────────────────────

ALTER TABLE app.exercise_submissions
  -- Réponses cochées : { "<question_id>": [index...] }
  ADD COLUMN IF NOT EXISTS answers JSONB,
  -- Barème au moment du rendu : un quiz modifié ensuite ne réécrit pas les notes.
  ADD COLUMN IF NOT EXISTS max_grade NUMERIC(5, 2)
    CHECK (max_grade IS NULL OR max_grade >= 0);

-- La contrainte d'origine exigeait un texte ou un fichier. Le rendu d'un quiz
-- n'a ni l'un ni l'autre : il n'aurait jamais pu être enregistré. Le nom de
-- cette contrainte est auto-généré, d'où la recherche plutôt qu'un DROP en dur.
DO $$
DECLARE
  v_nom TEXT;
BEGIN
  SELECT con.conname INTO v_nom
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
   WHERE ns.nspname = 'app'
     AND cl.relname = 'exercise_submissions'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%content%file_path%'
   LIMIT 1;
  IF v_nom IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.exercise_submissions DROP CONSTRAINT %I', v_nom);
  END IF;
END
$$;

ALTER TABLE app.exercise_submissions DROP CONSTRAINT IF EXISTS exercise_submissions_a_un_contenu;
ALTER TABLE app.exercise_submissions ADD CONSTRAINT exercise_submissions_a_un_contenu
  CHECK (content IS NOT NULL OR file_path IS NOT NULL OR answers IS NOT NULL);

-- ── 3. Lecture par le formateur à qui le dossier est confié ─────────────────
-- Additif : les policies de la 0080 (membres de l'organisation) restent en
-- place. Les écritures continuent de passer par le service role, derrière la
-- garde `requireMyTrainerDossier`.

DROP POLICY IF EXISTS exercises_formateur_espace ON app.exercises;
CREATE POLICY exercises_formateur_espace ON app.exercises FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND dossier_id IN (SELECT app.my_trainer_dossier_ids()));

DROP POLICY IF EXISTS exercise_submissions_formateur_espace ON app.exercise_submissions;
CREATE POLICY exercise_submissions_formateur_espace ON app.exercise_submissions FOR SELECT TO authenticated
  USING (exercise_id IN (SELECT id FROM app.exercises WHERE dossier_id IN (SELECT app.my_trainer_dossier_ids())));

COMMENT ON COLUMN app.exercises.kind IS
  'devoir (rendu libre, corrigé à la main) | quiz (questions à choix, corrigé automatiquement).';
COMMENT ON COLUMN app.exercises.questions IS
  'Questions du quiz : [{ id, enonce, choix, bonnes, points }]. Vide pour un devoir.';
COMMENT ON COLUMN app.exercise_submissions.max_grade IS
  'Barème figé au rendu : modifier le quiz ensuite ne réécrit pas les notes déjà données.';
