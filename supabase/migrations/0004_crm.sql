-- ============================================================================
-- 0004 — CRM context (companies, contacts, learners)
-- ============================================================================

CREATE TABLE app.companies (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  legal_name TEXT,
  siret CHAR(14),
  naf_code TEXT,
  vat_number TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_email CITEXT,
  contact_phone TEXT,
  website TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE app.contacts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  company_id UUID NOT NULL REFERENCES app.companies(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email CITEXT,
  phone TEXT,
  position TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE app.learners (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  birth_date DATE,
  birth_place TEXT,
  nationality TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('M', 'F', 'X')),
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  position TEXT,
  education_level TEXT,
  cpf_number TEXT,
  rqth BOOLEAN NOT NULL DEFAULT false,
  accessibility_notes TEXT,
  notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  anonymized_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX ix_companies_org ON app.companies(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_companies_org_name_trgm ON app.companies
  USING GIN (organization_id, name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_companies_org_siret ON app.companies(organization_id, siret)
  WHERE siret IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX ix_contacts_org_company ON app.contacts(organization_id, company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX ix_learners_org ON app.learners(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_learners_org_company ON app.learners(organization_id, company_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_learners_org_email ON app.learners(organization_id, email)
  WHERE deleted_at IS NULL AND anonymized_at IS NULL;
CREATE INDEX ix_learners_search ON app.learners
  USING GIN ((first_name || ' ' || last_name) gin_trgm_ops)
  WHERE deleted_at IS NULL;
