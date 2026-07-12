-- Sessions de groupe rattachées à une formation (sans dossier unique).
-- Une session peut désormais être « de groupe » : rattachée à une formation, sans
-- dossier propriétaire. Les dossiers concernés sont liés via session_dossiers
-- (dérivation des participants / RLS formateur déjà en place depuis 0052/0054/0055).

-- 1. dossier_id devient optionnel + nouvelle colonne formation_id.
ALTER TABLE app.sessions ALTER COLUMN dossier_id DROP NOT NULL;

ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES app.formations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sessions_org_formation ON app.sessions(organization_id, formation_id);

-- 2. Cohérence : une session est rattachée à un dossier OU à une formation (au moins l'un).
ALTER TABLE app.sessions DROP CONSTRAINT IF EXISTS sessions_dossier_or_formation;
ALTER TABLE app.sessions
  ADD CONSTRAINT sessions_dossier_or_formation
  CHECK (dossier_id IS NOT NULL OR formation_id IS NOT NULL);

-- 3. RLS : la lecture des signatures par un formateur doit passer par is_session_trainer,
--    car la feuille d'émargement d'une session de groupe a dossier_id NULL
--    (is_dossier_trainer(NULL) renverrait toujours faux).
DROP POLICY IF EXISTS attendance_signatures_select ON app.attendance_signatures;
CREATE POLICY attendance_signatures_select ON app.attendance_signatures FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND EXISTS (
    SELECT 1 FROM app.attendance_sheets s
    WHERE s.id = attendance_signatures.attendance_sheet_id
      AND (
        app.is_staff()
        OR (app.has_role('formateur') AND app.is_session_trainer(s.session_id))
      )
  )
);
