-- ============================================================================
-- 0012 — Complaints (Qualiopi indicateur 31)
-- ============================================================================

CREATE TABLE app.complaints (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  dossier_id UUID REFERENCES app.dossiers(id) ON DELETE SET NULL,
  learner_id UUID REFERENCES app.learners(id) ON DELETE SET NULL,
  company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('email', 'phone', 'questionnaire', 'in_person', 'other')),
  channel TEXT,
  reporter_name TEXT,
  reporter_email CITEXT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status app.complaint_status NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, reference)
);

CREATE TABLE app.complaint_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  complaint_id UUID NOT NULL REFERENCES app.complaints(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'status_change', 'assignment', 'resolution')),
  actor_user_id UUID REFERENCES auth.users(id),
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_complaints_org_status ON app.complaints(organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_complaint_events_complaint ON app.complaint_events(complaint_id, occurred_at DESC);
