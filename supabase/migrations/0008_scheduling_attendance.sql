-- ============================================================================
-- 0008 — Scheduling & Attendance
-- ============================================================================

CREATE TABLE app.sessions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  dossier_module_id UUID REFERENCES app.dossier_modules(id) ON DELETE SET NULL,
  title TEXT,
  modality app.training_modality NOT NULL,
  status app.session_status NOT NULL DEFAULT 'planned',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_hours NUMERIC(6,2) GENERATED ALWAYS AS
    (EXTRACT(EPOCH FROM (ends_at - starts_at)) / 3600.0) STORED,
  location TEXT,
  remote_url TEXT,
  zoom_meeting_id TEXT,
  zoom_join_url TEXT,
  zoom_metadata JSONB,
  notes TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE app.session_participants (
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  participant_kind TEXT NOT NULL CHECK (participant_kind IN ('learner', 'trainer')),
  learner_id UUID REFERENCES app.learners(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES app.trainers(id) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (session_id, participant_kind, COALESCE(learner_id, trainer_id)),
  CHECK (
    (participant_kind = 'learner' AND learner_id IS NOT NULL AND trainer_id IS NULL)
    OR
    (participant_kind = 'trainer' AND trainer_id IS NOT NULL AND learner_id IS NULL)
  )
);

CREATE TABLE app.attendance_sheets (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  half_day TEXT CHECK (half_day IN ('morning', 'afternoon', 'full', 'evening')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'completed', 'finalized')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id),
  document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, half_day)
);

CREATE TABLE app.attendance_signatures (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  attendance_sheet_id UUID NOT NULL REFERENCES app.attendance_sheets(id) ON DELETE CASCADE,
  participant_kind TEXT NOT NULL CHECK (participant_kind IN ('learner', 'trainer')),
  learner_id UUID REFERENCES app.learners(id) ON DELETE RESTRICT,
  trainer_id UUID REFERENCES app.trainers(id) ON DELETE RESTRICT,
  status app.attendance_status NOT NULL,
  signature_image_path TEXT,
  signed_at TIMESTAMPTZ,
  signer_ip INET,
  signer_user_agent TEXT,
  signature_hash TEXT,
  token_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (participant_kind = 'learner' AND learner_id IS NOT NULL AND trainer_id IS NULL)
    OR
    (participant_kind = 'trainer' AND trainer_id IS NOT NULL AND learner_id IS NULL)
  ),
  UNIQUE (attendance_sheet_id, participant_kind, COALESCE(learner_id, trainer_id))
);

CREATE INDEX ix_sessions_org_dossier ON app.sessions(organization_id, dossier_id);
CREATE INDEX ix_sessions_starts ON app.sessions(organization_id, starts_at);
CREATE INDEX ix_sessions_status ON app.sessions(organization_id, status);
CREATE INDEX ix_attendance_sheets_dossier ON app.attendance_sheets(dossier_id);
CREATE INDEX ix_attendance_signatures_sheet ON app.attendance_signatures(attendance_sheet_id);
CREATE INDEX ix_attendance_signatures_pending
  ON app.attendance_signatures(organization_id, signed_at)
  WHERE signed_at IS NULL;
