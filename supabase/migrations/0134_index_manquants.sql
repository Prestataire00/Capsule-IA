-- 0134 — Deux index sur des colonnes qui sont le chemin d'accès principal.
--
-- Constat (audit 2026-08-31, CAP-22) : deux colonnes très filtrées par le code
-- n'avaient aucun index.
--
-- `attendance_sheets(session_id)` — « les feuilles de cette séance » est la
-- lecture la plus fréquente du module émargement (7 sites). Seul `dossier_id`
-- était indexé ; or depuis la migration 0106, une feuille rattachée à une
-- session de groupe a `dossier_id NULL`. Pour ces sessions, l'index existant ne
-- sert à rien et la recherche parcourt la table.
--
-- `questionnaire_responses(assignment_id)` — « les réponses de cette
-- assignation » (10 sites). Seuls `dossier_id` et `template_id` étaient indexés.
--
-- Sans effet mesurable aujourd'hui — la base contient quelques dizaines de
-- lignes — mais ces deux lectures croissent avec le nombre de séances et de
-- questionnaires, c'est-à-dire avec l'activité de l'organisme.
--
-- Non retenus : `dossiers.status` et `documents.kind`, de faible cardinalité et
-- toujours filtrés avec `organization_id`, déjà indexé. Et
-- `session_participants(session_id)`, déjà servi par la première colonne de sa
-- clé primaire.

CREATE INDEX IF NOT EXISTS ix_attendance_sheets_session
  ON app.attendance_sheets(session_id);

CREATE INDEX IF NOT EXISTS ix_q_responses_assignment
  ON app.questionnaire_responses(assignment_id);
