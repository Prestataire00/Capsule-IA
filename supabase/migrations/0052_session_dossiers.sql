-- ============================================================================
-- 0052 — Partage d'une session par plusieurs dossiers (M2M)
-- ============================================================================

CREATE TABLE app.session_dossiers (
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, dossier_id)
);

CREATE INDEX ix_session_dossiers_dossier ON app.session_dossiers(dossier_id);
CREATE INDEX ix_session_dossiers_org ON app.session_dossiers(organization_id);

-- Backfill : chaque session existante partage (au moins) son dossier primaire.
INSERT INTO app.session_dossiers (session_id, dossier_id, organization_id)
SELECT s.id, s.dossier_id, s.organization_id FROM app.sessions s
ON CONFLICT (session_id, dossier_id) DO NOTHING;

ALTER TABLE app.session_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_dossiers_select ON app.session_dossiers FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable')
       OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id)))
);
CREATE POLICY session_dossiers_write ON app.session_dossiers FOR ALL
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
