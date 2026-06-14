-- ============================================================================
-- 0061 — Abandon dossier (flag manuel) + snapshot de suivi des heures
-- ============================================================================

ALTER TABLE app.dossiers
  ADD COLUMN abandoned_at   DATE,
  ADD COLUMN abandon_reason TEXT;

CREATE TABLE app.dossier_hours_tracking (
  dossier_id UUID PRIMARY KEY REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  hours_planned            NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours_delivered          NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours_attended           NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours_remaining_planned  NUMERIC(8,2) NOT NULL DEFAULT 0,
  projected_final_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,
  attendance_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  sessions_held            INT NOT NULL DEFAULT 0,
  absences_count           INT NOT NULL DEFAULT 0,
  justified_absences_count INT NOT NULL DEFAULT 0,
  at_risk BOOLEAN NOT NULL DEFAULT false,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_dossier_hours_at_risk
  ON app.dossier_hours_tracking (organization_id) WHERE at_risk;

ALTER TABLE app.dossier_hours_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY dossier_hours_tracking_rw ON app.dossier_hours_tracking
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
