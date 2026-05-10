-- ============================================================================
-- 0014 — Infrastructure : outbox, audit, workflows, notifications, feature flags
-- ============================================================================

-- Outbox : domain events
CREATE TABLE infra.domain_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  type TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  payload JSONB NOT NULL,
  correlation_id UUID,
  causation_id UUID,
  actor_user_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NULL,
  last_error TEXT
);

CREATE INDEX ix_events_pending
  ON infra.domain_events (next_retry_at NULLS FIRST)
  WHERE dispatched_at IS NULL;
CREATE INDEX ix_events_org_type_time
  ON infra.domain_events (organization_id, type, occurred_at DESC);
CREATE INDEX ix_events_aggregate
  ON infra.domain_events (aggregate_type, aggregate_id, occurred_at DESC);
CREATE INDEX ix_events_correlation
  ON infra.domain_events (correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE infra.processed_events (
  event_id UUID NOT NULL REFERENCES infra.domain_events(id) ON DELETE CASCADE,
  handler_name TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result JSONB,
  PRIMARY KEY (event_id, handler_name)
);

CREATE TABLE infra.event_dead_letter (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  event_id UUID NOT NULL REFERENCES infra.domain_events(id) ON DELETE CASCADE,
  handler_name TEXT NOT NULL,
  failed_attempts INT NOT NULL,
  error TEXT NOT NULL,
  payload_snapshot JSONB,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT
);

CREATE TABLE infra.workflows (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_event_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, name)
);

CREATE TABLE infra.workflow_runs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES infra.workflows(id) ON DELETE CASCADE,
  triggered_by_event_id UUID REFERENCES infra.domain_events(id),
  status app.workflow_run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.notifications (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
  template_code TEXT NOT NULL,
  recipient_email CITEXT,
  recipient_phone TEXT,
  recipient_user_id UUID REFERENCES auth.users(id),
  subject TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'delivered', 'opened')),
  external_id TEXT,
  sent_at TIMESTAMPTZ,
  error TEXT,
  related_aggregate_type TEXT,
  related_aggregate_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_notifications_org_status ON app.notifications(organization_id, status, created_at DESC);
CREATE INDEX ix_notifications_aggregate
  ON app.notifications(related_aggregate_type, related_aggregate_id);

CREATE TABLE app.feature_flags (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID REFERENCES app.organizations(id) ON DELETE CASCADE,
  org_scope UUID GENERATED ALWAYS AS (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_scope, key)
);

CREATE TABLE audit.audit_log (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID,
  actor_user_id UUID,
  actor_ip INET,
  actor_user_agent TEXT,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id UUID,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  before JSONB,
  after JSONB,
  diff JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_org_time ON audit.audit_log(organization_id, occurred_at DESC);
CREATE INDEX ix_audit_row ON audit.audit_log(table_name, row_id, occurred_at DESC);
CREATE INDEX ix_audit_actor ON audit.audit_log(actor_user_id, occurred_at DESC);
