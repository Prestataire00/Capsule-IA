-- ============================================================================
-- 0005 — Catalog context (formations, modules)
-- ============================================================================

CREATE TABLE app.formations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  objectives TEXT[] NOT NULL DEFAULT '{}',
  prerequisites TEXT[] NOT NULL DEFAULT '{}',
  target_audience TEXT,
  evaluation_method TEXT,
  pedagogical_method TEXT,
  default_modality app.training_modality NOT NULL DEFAULT 'presentiel',
  default_duration_hours NUMERIC(8,2) NOT NULL CHECK (default_duration_hours > 0),
  default_price_cents BIGINT NOT NULL DEFAULT 0 CHECK (default_price_cents >= 0),
  rncp_code TEXT,
  rs_code TEXT,
  certificateur TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, slug)
);

CREATE TABLE app.modules (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  default_duration_hours NUMERIC(8,2) NOT NULL CHECK (default_duration_hours > 0),
  objectives TEXT[] NOT NULL DEFAULT '{}',
  resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE app.formation_modules (
  formation_id UUID NOT NULL REFERENCES app.formations(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES app.modules(id) ON DELETE RESTRICT,
  position INT NOT NULL CHECK (position >= 0),
  duration_hours NUMERIC(8,2) NOT NULL CHECK (duration_hours > 0),
  is_optional BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (formation_id, module_id),
  UNIQUE (formation_id, position)
);

CREATE INDEX ix_formations_org_published ON app.formations(organization_id, is_published)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_formations_search ON app.formations
  USING GIN (title gin_trgm_ops) WHERE deleted_at IS NULL;
