-- ============================================================================
-- 0048 — Règles Qualiopi par indicateur (référentiel système + override OF)
-- ============================================================================

CREATE TYPE app.qualiopi_gate_stage AS ENUM ('entry', 'closing', 'none');

CREATE TYPE app.qualiopi_satisfaction_source AS ENUM (
  'proof', 'questionnaire_positionnement', 'questionnaire_evaluation',
  'attendance_signed', 'document_signed'
);

CREATE TABLE app.qualiopi_indicator_rules (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  is_system BOOLEAN GENERATED ALWAYS AS (organization_id IS NULL) STORED,
  indicator_id UUID NOT NULL REFERENCES app.qualiopi_indicators(id) ON DELETE CASCADE,
  stage app.qualiopi_gate_stage NOT NULL DEFAULT 'none',
  is_blocking BOOLEAN NOT NULL DEFAULT false,
  satisfaction_source app.qualiopi_satisfaction_source NOT NULL DEFAULT 'proof',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, indicator_id)
);

CREATE INDEX ix_qualiopi_rules_resolve
  ON app.qualiopi_indicator_rules (indicator_id, organization_id)
  WHERE is_active AND deleted_at IS NULL;

ALTER TABLE app.qualiopi_indicator_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY qualiopi_rules_read ON app.qualiopi_indicator_rules
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = app.current_organization_id());

CREATE POLICY qualiopi_rules_write ON app.qualiopi_indicator_rules
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
