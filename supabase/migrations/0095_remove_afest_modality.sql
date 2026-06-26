-- ============================================================================
-- 0095 — Retrait de la modalité 'afest' de l'enum app.training_modality
-- ============================================================================
-- Postgres n'autorise pas DROP VALUE sur un enum : on recrée le type sans
-- 'afest'. L'enum est porté par 5 colonnes (formations.default_modality,
-- sessions.modality, dossiers.modality, dossiers.modalities[], prospects.
-- preferred_modality) et 2 vues le référencent (v_dossiers_overview via
-- d.modality, attendance_consolidated via s.modality). On droppe les vues,
-- convertit les colonnes via text, puis recrée les vues à l'identique.
-- Garde-fou : aucune donnée ne doit déjà utiliser 'afest', sinon abandon.
-- ============================================================================

-- 1. Garde-fou : refuser la migration si des enregistrements utilisent 'afest'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM app.formations WHERE default_modality = 'afest')
     OR EXISTS (SELECT 1 FROM app.sessions   WHERE modality = 'afest')
     OR EXISTS (SELECT 1 FROM app.dossiers   WHERE modality = 'afest')
     OR EXISTS (SELECT 1 FROM app.dossiers   WHERE 'afest' = ANY(modalities))
     OR EXISTS (SELECT 1 FROM app.prospects  WHERE preferred_modality = 'afest')
  THEN
    RAISE EXCEPTION 'Migration 0095 interrompue : des enregistrements utilisent encore la modalité afest';
  END IF;
END $$;

-- 2. Droppe les vues dépendantes (recréées en fin de migration).
DROP VIEW IF EXISTS app.attendance_consolidated;
DROP VIEW IF EXISTS app.v_dossiers_overview;

-- 3. Droppe la contrainte CHECK qui compare modality (scalaire) et modalities[]
--    (0059). Sans ça, convertir une colonne avant l'autre ferait comparer le
--    nouveau type à l'ancien (operator does not exist). Recréée en étape 6.
ALTER TABLE app.dossiers DROP CONSTRAINT ck_dossiers_modality_in_set;

-- 4. Renomme l'ancien type et crée le nouveau sans 'afest'.
ALTER TYPE app.training_modality RENAME TO training_modality_old;

CREATE TYPE app.training_modality AS ENUM (
  'presentiel', 'distanciel', 'hybride'
);

-- 5. Convertit les colonnes (défauts retirés puis restaurés autour de l'ALTER).
ALTER TABLE app.formations ALTER COLUMN default_modality DROP DEFAULT;
ALTER TABLE app.dossiers   ALTER COLUMN modalities       DROP DEFAULT;

ALTER TABLE app.formations
  ALTER COLUMN default_modality TYPE app.training_modality
  USING default_modality::text::app.training_modality;

ALTER TABLE app.sessions
  ALTER COLUMN modality TYPE app.training_modality
  USING modality::text::app.training_modality;

ALTER TABLE app.dossiers
  ALTER COLUMN modality TYPE app.training_modality
  USING modality::text::app.training_modality;

ALTER TABLE app.dossiers
  ALTER COLUMN modalities TYPE app.training_modality[]
  USING modalities::text[]::app.training_modality[];

ALTER TABLE app.prospects
  ALTER COLUMN preferred_modality TYPE app.training_modality
  USING preferred_modality::text::app.training_modality;

ALTER TABLE app.formations ALTER COLUMN default_modality SET DEFAULT 'presentiel';
ALTER TABLE app.dossiers   ALTER COLUMN modalities       SET DEFAULT '{}';

-- 6. Recrée la contrainte CHECK (identique à 0059) sur les colonnes converties.
ALTER TABLE app.dossiers
  ADD CONSTRAINT ck_dossiers_modality_in_set
  CHECK (cardinality(modalities) = 0 OR modality = ANY(modalities));

-- 7. Supprime l'ancien type (plus aucune colonne ne le référence).
DROP TYPE app.training_modality_old;

-- 8. Recrée les vues à l'identique (cf. 0017 et 0060).
CREATE OR REPLACE VIEW app.v_dossiers_overview AS
SELECT
  d.id,
  d.organization_id,
  d.reference,
  d.status,
  d.modality,
  d.start_date,
  d.end_date,
  d.total_hours,
  d.total_amount_cents,
  d.qualiopi_ready,
  l.id   AS learner_id,
  l.first_name || ' ' || l.last_name AS learner_full_name,
  l.email AS learner_email,
  c.id   AS company_id,
  c.name AS company_name,
  f.id   AS formation_id,
  f.title AS formation_title,
  f.code  AS formation_code,
  (SELECT COUNT(*) FROM app.dossier_modules dm WHERE dm.dossier_id = d.id) AS modules_count,
  (SELECT COUNT(*) FROM app.sessions s WHERE s.dossier_id = d.id) AS sessions_count,
  (SELECT COUNT(*) FROM app.documents doc WHERE doc.dossier_id = d.id AND doc.deleted_at IS NULL) AS documents_count,
  (SELECT COUNT(*) FROM app.questionnaire_assignments qa
     WHERE qa.dossier_id = d.id AND qa.status NOT IN ('completed','expired')) AS questionnaires_pending,
  d.created_at,
  d.updated_at
FROM app.dossiers d
JOIN app.learners l   ON l.id = d.learner_id
LEFT JOIN app.companies c ON c.id = d.company_id
JOIN app.formations f ON f.id = d.formation_id
WHERE d.deleted_at IS NULL;

CREATE OR REPLACE VIEW app.attendance_consolidated
WITH (security_invoker = true) AS
SELECT
  sh.id                              AS attendance_sheet_id,
  sh.organization_id                 AS organization_id,
  sh.dossier_id                      AS dossier_id,
  sh.session_id                      AS session_id,
  sh.status                          AS status,
  d.company_id                       AS company_id,
  c.name                             AS company_name,
  tp.trainer_id                      AS trainer_id,
  (t.first_name || ' ' || t.last_name) AS trainer_name,
  s.starts_at                        AS session_starts_at,
  s.ends_at                          AS session_ends_at,
  s.duration_hours                   AS session_hours,
  s.modality::text                   AS modality,
  (SELECT count(*) FROM app.session_participants sp
     WHERE sp.session_id = sh.session_id
       AND sp.participant_kind = 'learner')          AS expected_count,
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner')         AS signed_count,
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner'
       AND sig.evidence_source IN ('zoom_api','zoom_csv')) AS zoom_count,
  (SELECT count(*) FROM app.attendance_signatures sig
     WHERE sig.attendance_sheet_id = sh.id
       AND sig.participant_kind = 'learner'
       AND sig.evidence_source IN ('manual','qr','trainer_override')) AS manual_count,
  (SELECT zl.status FROM app.zoom_sync_logs zl
     WHERE zl.session_id = sh.session_id
     ORDER BY zl.fetched_at DESC
     LIMIT 1)                                        AS zoom_last_sync_status
FROM app.attendance_sheets sh
JOIN app.sessions s         ON s.id = sh.session_id
LEFT JOIN app.dossiers d    ON d.id = sh.dossier_id
LEFT JOIN app.companies c   ON c.id = d.company_id
LEFT JOIN LATERAL (
  SELECT sp.trainer_id
    FROM app.session_participants sp
   WHERE sp.session_id = sh.session_id
     AND sp.participant_kind = 'trainer'
   ORDER BY sp.trainer_id
   LIMIT 1
) tp ON true
LEFT JOIN app.trainers t    ON t.id = tp.trainer_id;
