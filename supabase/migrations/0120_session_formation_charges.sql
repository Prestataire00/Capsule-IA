-- ============================================================================
-- 0120 — Charges au niveau SESSION / FORMATION : session_trainers + formation_expenses
-- ============================================================================
-- Phase 2 de la refonte Formation → Session. Les CHARGES opérationnelles (dépenses
-- du jour, rémunération formateur, sous-traitance) remontent au niveau
-- session/formation (et non plus le dossier apprenant). Le dossier apprenant garde
-- le financement nominatif (financeurs, facturation). Rien n'est supprimé :
-- app.dossier_expenses et app.dossier_trainers restent (compat) ; la migration des
-- données existantes se fait à part.

-- Formateur(s) affecté(s) à une session + rémunération (au jour / à la session).
CREATE TABLE app.session_trainers (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id       UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  trainer_id       UUID        NOT NULL REFERENCES app.trainers(id) ON DELETE RESTRICT,
  is_lead          BOOLEAN     NOT NULL DEFAULT false,
  hourly_rate_cents BIGINT     CHECK (hourly_rate_cents IS NULL OR hourly_rate_cents >= 0),
  amount_cents     BIGINT      CHECK (amount_cents IS NULL OR amount_cents >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (session_id, trainer_id)
);
CREATE INDEX ix_session_trainers_session ON app.session_trainers (session_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_session_trainers_trainer ON app.session_trainers (trainer_id) WHERE deleted_at IS NULL;

-- Dépenses/charges au JOUR (session_id NOT NULL) OU générales à la formation
-- (session_id NULL). Toujours rattachées à une formation pour l'agrégat budget.
CREATE TABLE app.formation_expenses (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  formation_id     UUID        NOT NULL REFERENCES app.formations(id) ON DELETE CASCADE,
  session_id       UUID        REFERENCES app.sessions(id) ON DELETE SET NULL,
  kind             app.expense_kind NOT NULL,
  label            TEXT        NOT NULL,
  amount_cents     BIGINT      NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  hours            NUMERIC(8,2),
  supplier_name    TEXT,
  incurred_on      DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX ix_formation_expenses_formation ON app.formation_expenses (formation_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_formation_expenses_session ON app.formation_expenses (session_id) WHERE deleted_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE app.session_trainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_trainers FORCE ROW LEVEL SECURITY;
CREATE POLICY session_trainers_read ON app.session_trainers FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());
CREATE POLICY session_trainers_write ON app.session_trainers FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

ALTER TABLE app.formation_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.formation_expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY formation_expenses_read ON app.formation_expenses FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());
CREATE POLICY formation_expenses_write ON app.formation_expenses FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
