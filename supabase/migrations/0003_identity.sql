-- ============================================================================
-- 0003 — Identity context (organizations, profiles, members, invitations)
-- ============================================================================

CREATE TABLE app.organizations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  name TEXT NOT NULL,
  legal_name TEXT,
  siret CHAR(14) UNIQUE,
  naf_code TEXT,
  declaration_activite TEXT,
  qualiopi_certified_at DATE,
  qualiopi_certificate_path TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_email CITEXT NOT NULL,
  contact_phone TEXT,
  logo_path TEXT,
  brand JSONB NOT NULL DEFAULT '{}'::jsonb,
  security_settings JSONB NOT NULL DEFAULT
    '{"enforce_mfa_for_admins": true}'::jsonb,
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE app.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  phone TEXT,
  avatar_path TEXT,
  locale TEXT NOT NULL DEFAULT 'fr-FR',
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app.members (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app.member_role NOT NULL,
  is_default_org BOOLEAN NOT NULL DEFAULT false,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE app.invitations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  email CITEXT NOT NULL,
  role app.member_role NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status app.invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_members_org ON app.members(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_members_user ON app.members(user_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_invitations_org_status ON app.invitations(organization_id, status);
