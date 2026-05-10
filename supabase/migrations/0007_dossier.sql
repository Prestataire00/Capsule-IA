-- ============================================================================
-- 0007 — Dossier (aggregate root)
-- ============================================================================

CREATE TABLE app.dossiers (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,

  learner_id UUID NOT NULL REFERENCES app.learners(id) ON DELETE RESTRICT,
  company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL,
  formation_id UUID NOT NULL REFERENCES app.formations(id) ON DELETE RESTRICT,
  formation_snapshot JSONB NOT NULL,

  status app.dossier_status NOT NULL DEFAULT 'draft',
  modality app.training_modality NOT NULL,

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_hours NUMERIC(8,2) NOT NULL CHECK (total_hours > 0),

  total_amount_cents BIGINT,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',

  accessibility_notes TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,

  qualiopi_readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualiopi_ready BOOLEAN NOT NULL DEFAULT false,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,

  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,

  CHECK (end_date >= start_date),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  UNIQUE (organization_id, reference)
);

CREATE TABLE app.dossier_modules (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES app.modules(id) ON DELETE RESTRICT,
  position INT NOT NULL CHECK (position >= 0),
  title_snapshot TEXT NOT NULL,
  duration_hours NUMERIC(8,2) NOT NULL CHECK (duration_hours > 0),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  UNIQUE (dossier_id, module_id),
  UNIQUE (dossier_id, position)
);

CREATE TABLE app.dossier_trainers (
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES app.trainers(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  is_lead BOOLEAN NOT NULL DEFAULT false,
  hourly_rate_cents BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dossier_id, trainer_id)
);

CREATE TABLE app.dossier_funders (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  funder_id UUID NOT NULL REFERENCES app.funders(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  share_percent NUMERIC(5,2) CHECK (share_percent IS NULL OR share_percent BETWEEN 0 AND 100),
  external_file_number TEXT,
  agreement_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'refused', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dossier_id, funder_id)
);

CREATE TABLE app.dossier_status_history (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  from_status app.dossier_status,
  to_status app.dossier_status NOT NULL,
  reason TEXT,
  triggered_by UUID REFERENCES auth.users(id),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE app.dossier_drafts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_dossiers_org_status ON app.dossiers(organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_dossiers_org_period ON app.dossiers(organization_id, start_date, end_date)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_dossiers_learner ON app.dossiers(learner_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_dossiers_company ON app.dossiers(company_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_dossiers_formation ON app.dossiers(formation_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_dossiers_qualiopi ON app.dossiers(organization_id, qualiopi_ready)
  WHERE deleted_at IS NULL;
CREATE INDEX ix_dossiers_search_ref ON app.dossiers
  USING GIN (reference gin_trgm_ops);

CREATE INDEX ix_dossier_modules_dossier ON app.dossier_modules(dossier_id);
CREATE INDEX ix_dossier_funders_dossier ON app.dossier_funders(dossier_id);
CREATE INDEX ix_dossier_status_history_dossier ON app.dossier_status_history(dossier_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION app.check_dossier_funders_share()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(share_percent), 0) INTO total
  FROM app.dossier_funders
  WHERE dossier_id = COALESCE(NEW.dossier_id, OLD.dossier_id);
  IF total > 100 THEN
    RAISE EXCEPTION 'dossier_funders share_percent total > 100 (got %)', total;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER tg_dossier_funders_share
AFTER INSERT OR UPDATE OF share_percent OR DELETE ON app.dossier_funders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.check_dossier_funders_share();
