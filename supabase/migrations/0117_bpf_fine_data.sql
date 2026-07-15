-- ============================================================================
-- 0117 — Données fines BPF (Cerfa 10443*17)
-- ============================================================================
-- Re-home idempotent d'un DDL appliqué en prod hors-lignée (ancienne version
-- 0110, réputée « revertée » dans l'historique mais dont les objets persistent
-- en base). Ce fichier redevient la source de vérité : no-op sur prod (objets
-- déjà présents), applique intégralement sur une base neuve. Tous les CREATE
-- sont gardés (IF NOT EXISTS / DO block / DROP-then-CREATE).
--
-- 1. Type d'action + catégorie de stagiaire par dossier (auto-inférés, éditables)
-- 2. Suivi des dépenses par dossier (charges, salaires formateurs, sous-traitance
--    confiée) pour les cadres charges/sous-traitance du BPF.
-- ============================================================================

-- ---------- Enums (gardés : CREATE TYPE n'a pas de IF NOT EXISTS) --------
DO $$ BEGIN
  CREATE TYPE app.dossier_action_type AS ENUM (
    'action_formation', 'bilan_competences', 'vae', 'apprentissage',
    'formation_continue', 'formation_initiale'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app.trainee_category AS ENUM (
    'salarie', 'demandeur_emploi', 'particulier', 'apprenti', 'autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE app.expense_kind AS ENUM (
    'salaire_formateur', 'achat_formation', 'sous_traitance_confiee', 'autre'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- Colonnes dossiers -------------------------------------------
ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS action_type      app.dossier_action_type,
  ADD COLUMN IF NOT EXISTS trainee_category app.trainee_category;

COMMENT ON COLUMN app.dossiers.action_type IS 'Type d''action BPF (cadre C) — auto-inféré depuis la formation, éditable.';
COMMENT ON COLUMN app.dossiers.trainee_category IS 'Catégorie de stagiaire BPF (cadre C) — auto-inférée (financeur + statut), éditable.';

-- ---------- Inférence ----------------------------------------------------
-- Type d'action : depuis metadata.catalog.actionType de la formation, sinon
-- « action de formation ».
CREATE OR REPLACE FUNCTION app.infer_dossier_action_type(p_formation_id uuid)
RETURNS app.dossier_action_type LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT (f.metadata->'catalog'->>'actionType')::app.dossier_action_type
       FROM app.formations f
      WHERE f.id = p_formation_id
        AND f.metadata->'catalog'->>'actionType' IN (
          'action_formation','bilan_competences','vae','apprentissage',
          'formation_continue','formation_initiale')),
    'action_formation'::app.dossier_action_type
  );
$$;

-- Catégorie de stagiaire : priorité au type d'action (apprentissage), puis à
-- l'origine du financement, puis au statut de l'apprenant.
CREATE OR REPLACE FUNCTION app.infer_trainee_category(
  p_action         app.dossier_action_type,
  p_funder_kind    app.funder_kind,
  p_learner_statut text,
  p_has_company    boolean
) RETURNS app.trainee_category LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE
    WHEN p_action = 'apprentissage'                          THEN 'apprenti'
    WHEN p_funder_kind IN ('region','pole_emploi')           THEN 'demandeur_emploi'
    WHEN p_funder_kind IN ('entreprise','opco','faf_ca','agefiph') THEN 'salarie'
    WHEN p_funder_kind = 'autofinancement'                   THEN 'particulier'
    WHEN p_learner_statut = 'salarie'                        THEN 'salarie'
    WHEN p_has_company                                       THEN 'salarie'
    WHEN p_learner_statut IN ('independant','dirigeant')     THEN 'particulier'
    ELSE 'autre'
  END)::app.trainee_category;
$$;

-- Backfill des dossiers existants (financeur principal = plus gros montant).
-- Idempotent : ne touche que les lignes encore NULL.
UPDATE app.dossiers d
SET action_type = COALESCE(d.action_type, app.infer_dossier_action_type(d.formation_id)),
    trainee_category = COALESCE(d.trainee_category, app.infer_trainee_category(
      app.infer_dossier_action_type(d.formation_id),
      (SELECT fu.kind FROM app.dossier_funders df
         JOIN app.funders fu ON fu.id = df.funder_id
        WHERE df.dossier_id = d.id
        ORDER BY df.amount_cents DESC NULLS LAST LIMIT 1),
      (SELECT l.statut FROM app.learners l WHERE l.id = d.learner_id),
      d.company_id IS NOT NULL
    ))
WHERE d.action_type IS NULL OR d.trainee_category IS NULL;

-- Défauts à la création (les financeurs ne sont pas encore rattachés → NULL).
CREATE OR REPLACE FUNCTION app.tg_dossier_infer_bpf()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action_type IS NULL THEN
    NEW.action_type := app.infer_dossier_action_type(NEW.formation_id);
  END IF;
  IF NEW.trainee_category IS NULL THEN
    NEW.trainee_category := app.infer_trainee_category(
      COALESCE(NEW.action_type, app.infer_dossier_action_type(NEW.formation_id)),
      NULL::app.funder_kind,
      (SELECT l.statut FROM app.learners l WHERE l.id = NEW.learner_id),
      NEW.company_id IS NOT NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_dossiers_infer_bpf ON app.dossiers;
CREATE TRIGGER tg_dossiers_infer_bpf
BEFORE INSERT ON app.dossiers
FOR EACH ROW EXECUTE FUNCTION app.tg_dossier_infer_bpf();

-- ---------- Dépenses par dossier ----------------------------------------
CREATE TABLE IF NOT EXISTS app.dossier_expenses (
  id              UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id      UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  kind            app.expense_kind NOT NULL,
  label           TEXT,
  amount_cents    BIGINT NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  hours           NUMERIC(8,2) CHECK (hours IS NULL OR hours >= 0), -- heures confiées (sous-traitance)
  supplier_name   TEXT,          -- prestataire / OF sous-traitant
  incurred_on     DATE,          -- date de la charge (rattachement à l'année BPF)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_dossier_expenses_dossier ON app.dossier_expenses(dossier_id);
CREATE INDEX IF NOT EXISTS ix_dossier_expenses_org_date ON app.dossier_expenses(organization_id, incurred_on);

DROP TRIGGER IF EXISTS tg_dossier_expenses_updated ON app.dossier_expenses;
CREATE TRIGGER tg_dossier_expenses_updated
BEFORE UPDATE ON app.dossier_expenses
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.dossier_expenses ENABLE ROW LEVEL SECURITY;

-- Policies gardées (PG < 15 : pas de CREATE POLICY IF NOT EXISTS → DROP puis CREATE).
DROP POLICY IF EXISTS dossier_expenses_select ON app.dossier_expenses;
CREATE POLICY dossier_expenses_select ON app.dossier_expenses FOR SELECT
  USING (organization_id = app.current_organization_id()
         AND (app.is_staff() OR app.has_role('comptable'))
         AND deleted_at IS NULL);

DROP POLICY IF EXISTS dossier_expenses_insert ON app.dossier_expenses;
CREATE POLICY dossier_expenses_insert ON app.dossier_expenses FOR INSERT
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS dossier_expenses_update ON app.dossier_expenses;
CREATE POLICY dossier_expenses_update ON app.dossier_expenses FOR UPDATE
  USING  (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS dossier_expenses_delete ON app.dossier_expenses;
CREATE POLICY dossier_expenses_delete ON app.dossier_expenses FOR DELETE
  USING (organization_id = app.current_organization_id() AND app.is_staff());

-- Recharge le cache de schéma PostgREST (nouveaux types/colonnes/table).
NOTIFY pgrst, 'reload schema';
