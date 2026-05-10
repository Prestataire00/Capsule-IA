-- ============================================================================
-- 0006 — Trainers & funders
-- ============================================================================

CREATE TABLE app.trainers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  siret CHAR(14),
  hourly_rate_cents BIGINT,
  bio TEXT,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, email)
);

CREATE TABLE app.trainer_competencies (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES app.trainers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('diploma', 'certification', 'experience', 'cv')),
  title TEXT NOT NULL,
  issuer TEXT,
  obtained_at DATE,
  expires_at DATE,
  document_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.funders (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  kind app.funder_kind NOT NULL,
  name TEXT NOT NULL,
  contact_email CITEXT,
  contact_phone TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX ix_trainers_org ON app.trainers(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_funders_org_kind ON app.funders(organization_id, kind) WHERE deleted_at IS NULL;
