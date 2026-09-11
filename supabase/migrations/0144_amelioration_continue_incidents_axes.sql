-- 0144 — Amélioration continue : incidents, axes d'amélioration, actions correctives
--
-- Le module 0102 tenait un registre de veille et une liste d'actions reliées
-- aux réclamations. Il lui manquait, sur le modèle de Digiforma :
--
--  · les INCIDENTS — aléas, difficultés, abandons, insatisfactions survenus en
--    cours de prestation (indicateur 31 : « traitement des difficultés, des
--    réclamations et des aléas »). Les réclamations restent dans leur module ;
--    tout le reste n'avait nulle part où être consigné ;
--  · les AXES D'AMÉLIORATION — ce que l'organisme décide d'améliorer, suivi en
--    trois temps : à adresser, en cours, optimisé (indicateur 32, et l'analyse
--    des risques demandée par la V10) ;
--  · le lien entre les deux : une action corrective naît d'un incident ou
--    d'une réclamation, et sert un axe.
--
-- Rejouable.

-- ── 1. Incidents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.quality_incidents (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('alea', 'difficulte', 'abandon', 'insatisfaction', 'autre')),
  title           TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description     TEXT CHECK (description IS NULL OR length(description) <= 4000),
  dossier_id      UUID REFERENCES app.dossiers(id) ON DELETE SET NULL,
  occurred_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  severity        TEXT NOT NULL DEFAULT 'moyenne' CHECK (severity IN ('faible', 'moyenne', 'elevee')),
  status          TEXT NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert', 'traite')),
  resolution      TEXT CHECK (resolution IS NULL OR length(resolution) <= 4000),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ NULL,
  -- Un incident ne se déclare pas traité sans dire comment.
  CHECK (status = 'ouvert' OR btrim(COALESCE(resolution, '')) <> '')
);
CREATE INDEX IF NOT EXISTS ix_quality_incidents_org
  ON app.quality_incidents (organization_id, status, occurred_on DESC) WHERE deleted_at IS NULL;

-- ── 2. Axes d'amélioration ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.improvement_axes (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description      TEXT CHECK (description IS NULL OR length(description) <= 4000),
  -- Indicateur Qualiopi que l'axe sert, le cas échéant.
  indicator_number INT CHECK (indicator_number IS NULL OR indicator_number BETWEEN 1 AND 33),
  status           TEXT NOT NULL DEFAULT 'a_adresser' CHECK (status IN ('a_adresser', 'en_cours', 'optimise')),
  optimised_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS ix_improvement_axes_org
  ON app.improvement_axes (organization_id, status) WHERE deleted_at IS NULL;

-- ── 3. Actions correctives : origine « incident », rattachement à un axe ────
ALTER TABLE app.improvement_actions
  ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES app.quality_incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS axis_id     UUID REFERENCES app.improvement_axes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_improvement_incident ON app.improvement_actions (incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_improvement_axis ON app.improvement_actions (axis_id) WHERE axis_id IS NOT NULL;

-- La contrainte d'origine de 0102 est remplacée, quel que soit son nom.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'app.improvement_actions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%origin%'
  LOOP
    EXECUTE format('ALTER TABLE app.improvement_actions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE app.improvement_actions
  ADD CONSTRAINT improvement_actions_origin_check
  CHECK (origin IN ('reclamation', 'satisfaction', 'audit', 'veille', 'incident', 'autre'));

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE app.quality_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quality_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE app.improvement_axes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.improvement_axes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quality_incidents_select ON app.quality_incidents;
CREATE POLICY quality_incidents_select ON app.quality_incidents FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
DROP POLICY IF EXISTS quality_incidents_insert ON app.quality_incidents;
CREATE POLICY quality_incidents_insert ON app.quality_incidents FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
DROP POLICY IF EXISTS quality_incidents_update ON app.quality_incidents;
CREATE POLICY quality_incidents_update ON app.quality_incidents FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS improvement_axes_select ON app.improvement_axes;
CREATE POLICY improvement_axes_select ON app.improvement_axes FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
DROP POLICY IF EXISTS improvement_axes_insert ON app.improvement_axes;
CREATE POLICY improvement_axes_insert ON app.improvement_axes FOR INSERT TO authenticated
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
DROP POLICY IF EXISTS improvement_axes_update ON app.improvement_axes;
CREATE POLICY improvement_axes_update ON app.improvement_axes FOR UPDATE TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

COMMENT ON TABLE app.quality_incidents IS
  'Aléas, difficultés, abandons, insatisfactions survenus en cours de prestation (Qualiopi indicateur 31).';
COMMENT ON TABLE app.improvement_axes IS
  'Axes d''amélioration de l''organisme : à adresser, en cours, optimisé (Qualiopi indicateur 32).';

NOTIFY pgrst, 'reload schema';
