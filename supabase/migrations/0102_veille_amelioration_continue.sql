-- 0102_veille_amelioration_continue.sql
-- Module Veille & amélioration continue (Qualiopi critère 6) :
--   * veille_entries : registre de veille (légale, métier, pédagogique, techno, handicap)
--   * improvement_actions : plan d'amélioration continue (actions), alimenté notamment
--     par les réclamations (lien complaint_id) et la satisfaction / audits / veille.

CREATE TABLE app.veille_entries (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('legale', 'metier', 'pedagogique', 'technologique', 'handicap', 'autre')),
  title           TEXT NOT NULL,
  summary         TEXT,
  source_url      TEXT,
  impact          TEXT,
  status          TEXT NOT NULL DEFAULT 'a_traiter' CHECK (status IN ('a_traiter', 'en_cours', 'traitee')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ NULL
);
CREATE INDEX ix_veille_org ON app.veille_entries (organization_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE app.improvement_actions (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  origin           TEXT NOT NULL CHECK (origin IN ('reclamation', 'satisfaction', 'audit', 'veille', 'autre')),
  complaint_id     UUID REFERENCES app.complaints(id) ON DELETE SET NULL,
  veille_entry_id  UUID REFERENCES app.veille_entries(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  owner            TEXT,
  priority         TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  due_date         DATE,
  done_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);
CREATE INDEX ix_improvement_org_status ON app.improvement_actions (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX ix_improvement_complaint ON app.improvement_actions (complaint_id) WHERE complaint_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE app.veille_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.veille_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE app.improvement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.improvement_actions FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation.
CREATE POLICY veille_select ON app.veille_entries FOR SELECT
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
CREATE POLICY veille_insert ON app.veille_entries FOR INSERT
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY veille_update ON app.veille_entries FOR UPDATE
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY improvement_select ON app.improvement_actions FOR SELECT
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
CREATE POLICY improvement_insert ON app.improvement_actions FOR INSERT
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY improvement_update ON app.improvement_actions FOR UPDATE
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
