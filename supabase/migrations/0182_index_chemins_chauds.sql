-- 0182 — Index manquants sur le chemin des politiques RLS
--
-- Constat (audit du 19/09/2026) : trois colonnes de clé étrangère très
-- sollicitées n'étaient indexées nulle part, et deux d'entre elles sont lues à
-- l'INTÉRIEUR du `USING` de douze politiques de l'espace formateur (0150). Une
-- expression de politique est évaluée par ligne candidate : un parcours
-- séquentiel s'y répète, et le coût croît bien plus vite que le volume.
--
--  · `dossier_trainers(trainer_id)` — la clé primaire est
--    (dossier_id, trainer_id), donc inutilisable pour un filtre sur le seul
--    formateur. Or `app.trainer_session_ids()` et `app.my_trainer_dossier_ids()`
--    font exactement cela, à chaque écran de l'espace formateur.
--  · `session_participants(learner_id)` et `(trainer_id)` — même raison : la
--    clé primaire commence par `session_id`. `learner_id` est filtré seul à
--    chaque ouverture de l'espace apprenant, en service role, donc sans même
--    le prédicat d'organisation qu'ajouterait la RLS.
--  · `attendance_signatures(learner_id|trainer_id)` — références en
--    ON DELETE RESTRICT sur l'une des tables les plus écrites : sans index,
--    toute suppression d'apprenant ou de formateur la parcourt entièrement.
--  · `invoices(dossier_id)` et `tasks(dossier_id|session_id)` — « les factures
--    de ce dossier », « les tâches de ce dossier » : le chemin naturel.
--
-- `IF NOT EXISTS` partout : rejouable sans risque. Les tables sont encore
-- petites, la création est immédiate.

CREATE INDEX IF NOT EXISTS ix_dossier_trainers_trainer
  ON app.dossier_trainers (trainer_id);

CREATE INDEX IF NOT EXISTS ix_session_participants_learner
  ON app.session_participants (learner_id) WHERE learner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_session_participants_trainer
  ON app.session_participants (trainer_id) WHERE trainer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_attendance_signatures_learner
  ON app.attendance_signatures (learner_id) WHERE learner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_attendance_signatures_trainer
  ON app.attendance_signatures (trainer_id) WHERE trainer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_invoices_dossier
  ON app.invoices (dossier_id) WHERE dossier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_dossier
  ON app.tasks (dossier_id) WHERE dossier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_tasks_session
  ON app.tasks (session_id) WHERE session_id IS NOT NULL;
