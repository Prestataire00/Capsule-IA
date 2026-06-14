-- ============================================================================
-- 0045 — Tâches matérialisées par dossier × financeur (checklist + brouillon)
-- ============================================================================

CREATE TYPE app.funder_task_status AS ENUM (
  'pending', 'ready', 'drafted', 'sent', 'done', 'skipped'
);

CREATE TABLE app.dossier_funder_tasks (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  funder_id UUID NOT NULL REFERENCES app.funders(id) ON DELETE CASCADE,
  playbook_step_id UUID NOT NULL REFERENCES app.funder_playbook_steps(id) ON DELETE CASCADE,
  due_date DATE,
  status app.funder_task_status NOT NULL DEFAULT 'pending',
  draft_subject TEXT,
  draft_html TEXT,
  resolved_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at TIMESTAMPTZ,
  sent_by UUID REFERENCES auth.users(id),
  resend_message_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dossier_id, funder_id, playbook_step_id)
);

CREATE INDEX ix_dossier_funder_tasks_dossier
  ON app.dossier_funder_tasks (dossier_id, funder_id);
CREATE INDEX ix_dossier_funder_tasks_due
  ON app.dossier_funder_tasks (organization_id, due_date)
  WHERE status IN ('pending', 'ready', 'drafted');

ALTER TABLE app.dossier_funder_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY dossier_funder_tasks_rw ON app.dossier_funder_tasks
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
