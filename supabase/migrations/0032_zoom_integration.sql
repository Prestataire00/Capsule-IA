-- ============================================================================
-- 0032 — Intégration Zoom : secrets chiffrés + logs sync + unmatched
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgsodium;

CREATE TABLE app.tenant_integrations (
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('zoom_s2s')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled','error')),
  config_encrypted BYTEA NOT NULL,
  config_nonce BYTEA NOT NULL,
  config_key_id UUID NOT NULL,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kind)
);

CREATE TABLE app.zoom_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES app.sessions(id) ON DELETE CASCADE,
  attendance_sheet_id UUID REFERENCES app.attendance_sheets(id) ON DELETE SET NULL,
  meeting_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  participants_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  unmatched_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success','partial','error')),
  error_detail TEXT,
  payload_size_bytes INT
);
CREATE INDEX ix_zoom_sync_logs_session ON app.zoom_sync_logs(session_id);
CREATE INDEX ix_zoom_sync_logs_org_fetched ON app.zoom_sync_logs(organization_id, fetched_at DESC);

CREATE TABLE app.zoom_import_unmatched (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  attendance_sheet_id UUID NOT NULL REFERENCES app.attendance_sheets(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('zoom_csv','zoom_api')),
  raw_email TEXT,
  raw_name TEXT,
  join_time TIMESTAMPTZ,
  leave_time TIMESTAMPTZ,
  duration_minutes INT,
  resolved_learner_id UUID REFERENCES app.learners(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_zoom_unmatched_sheet ON app.zoom_import_unmatched(attendance_sheet_id);
CREATE INDEX ix_zoom_unmatched_pending
  ON app.zoom_import_unmatched(organization_id)
  WHERE resolved_at IS NULL;

ALTER TABLE app.tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant_integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_sync_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_import_unmatched ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_import_unmatched FORCE ROW LEVEL SECURITY;

-- Bucket privé pour CSV bruts (audit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'zoom_imports',
  'zoom_imports',
  false,
  10485760, -- 10 MB max
  ARRAY['text/csv','application/vnd.ms-excel']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "zoom_imports_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'zoom_imports');
