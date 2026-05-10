-- ============================================================================
-- 0010 — Qualiopi (referentiel + preuves + checklists)
-- ============================================================================

CREATE TABLE app.qualiopi_indicators (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  code TEXT NOT NULL UNIQUE,
  number INT NOT NULL UNIQUE CHECK (number BETWEEN 1 AND 32),
  scope app.qualiopi_indicator_scope NOT NULL,
  criterion INT NOT NULL CHECK (criterion BETWEEN 1 AND 7),
  title TEXT NOT NULL,
  description TEXT,
  expected_proofs TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE app.qualiopi_proofs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES app.qualiopi_indicators(id) ON DELETE RESTRICT,
  scope app.qualiopi_indicator_scope NOT NULL,
  dossier_id UUID REFERENCES app.dossiers(id) ON DELETE CASCADE,
  document_id UUID REFERENCES app.documents(id) ON DELETE SET NULL,
  external_path TEXT,
  title TEXT NOT NULL,
  description TEXT,
  valid_from DATE,
  valid_until DATE,
  is_valid BOOLEAN GENERATED ALWAYS AS (
    (valid_until IS NULL OR valid_until >= CURRENT_DATE)
    AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
  ) STORED,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  CHECK (
    (scope = 'organization' AND dossier_id IS NULL)
    OR
    (scope = 'dossier' AND dossier_id IS NOT NULL)
  )
);

CREATE TABLE app.qualiopi_dossier_checklists (
  dossier_id UUID PRIMARY KEY REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_indicators INT NOT NULL,
  satisfied_indicators INT NOT NULL,
  blocking_missing INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_ready BOOLEAN GENERATED ALWAYS AS (blocking_missing = 0) STORED
);

CREATE INDEX ix_qualiopi_proofs_org ON app.qualiopi_proofs(organization_id, indicator_id)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_qualiopi_proofs_dossier ON app.qualiopi_proofs(dossier_id)
  WHERE deleted_at IS NULL;
