-- Un cours appartient à une séance.
--
-- Depuis la 0080 un exercice exigeait un dossier. C'était le bon ancrage pour
-- un suivi individuel, pas pour préparer une journée : un formateur prépare
-- « le quiz de la séance du 28 », et une séance de groupe sert plusieurs
-- dossiers à la fois — il fallait alors en choisir un arbitrairement, et le
-- même quiz devenait invisible aux stagiaires des autres.
--
-- L'exercice tient désormais à l'un OU l'autre : une séance (cas courant) ou un
-- dossier (travail individuel). Jamais ni l'un ni l'autre.

ALTER TABLE app.exercises ALTER COLUMN dossier_id DROP NOT NULL;

ALTER TABLE app.exercises DROP CONSTRAINT IF EXISTS exercises_rattachement;
ALTER TABLE app.exercises ADD CONSTRAINT exercises_rattachement
  CHECK (dossier_id IS NOT NULL OR session_id IS NOT NULL);

-- Lecture du cours d'une séance par le formateur qui l'anime (0150), en plus
-- de la lecture par dossier confié (0171).
DROP POLICY IF EXISTS exercises_formateur_seance ON app.exercises;
CREATE POLICY exercises_formateur_seance ON app.exercises FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS exercise_submissions_formateur_seance ON app.exercise_submissions;
CREATE POLICY exercise_submissions_formateur_seance ON app.exercise_submissions FOR SELECT TO authenticated
  USING (
    exercise_id IN (
      SELECT id FROM app.exercises WHERE session_id IN (SELECT app.my_trainer_session_ids())
    )
  );

COMMENT ON COLUMN app.exercises.session_id IS
  'Séance à laquelle le cours se rattache. L''un des deux ancrages, avec dossier_id.';
COMMENT ON COLUMN app.exercises.dossier_id IS
  'Dossier auquel l''exercice se rattache, pour un travail individuel. Facultatif depuis la 0174.';
