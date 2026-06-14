-- ============================================================================
-- 0044 — Playbooks financeurs (bibliothèque système + override par OF)
-- ============================================================================

-- Ancre du calendrier relatif au cycle de vie du dossier.
CREATE TYPE app.funder_step_anchor AS ENUM (
  'dossier_created', 'session_start', 'session_end', 'manual'
);

-- Un playbook par (org|système) × funder_kind. organization_id NULL = système.
CREATE TABLE app.funder_playbooks (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  is_system BOOLEAN GENERATED ALWAYS AS (organization_id IS NULL) STORED,
  funder_kind app.funder_kind NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, code)
);

CREATE INDEX ix_funder_playbooks_resolve
  ON app.funder_playbooks (funder_kind, organization_id)
  WHERE deleted_at IS NULL AND is_active;

CREATE TABLE app.funder_playbook_steps (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  playbook_id UUID NOT NULL REFERENCES app.funder_playbooks(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  anchor app.funder_step_anchor NOT NULL,
  offset_days INT NOT NULL DEFAULT 0,
  email_subject_template TEXT NOT NULL,
  email_body_template TEXT NOT NULL,
  required_document_kinds TEXT[] NOT NULL DEFAULT '{}',
  reference_document_codes TEXT[] NOT NULL DEFAULT '{}',
  is_required BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (playbook_id, step_order)
);

CREATE INDEX ix_funder_playbook_steps_playbook
  ON app.funder_playbook_steps (playbook_id, step_order);

ALTER TABLE app.funder_playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.funder_playbook_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY funder_playbooks_read ON app.funder_playbooks
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = app.current_organization_id());

CREATE POLICY funder_playbooks_write ON app.funder_playbooks
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());

CREATE POLICY funder_playbook_steps_read ON app.funder_playbook_steps
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = app.current_organization_id());

CREATE POLICY funder_playbook_steps_write ON app.funder_playbook_steps
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
