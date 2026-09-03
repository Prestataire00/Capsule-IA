-- 0135 — Saisie manuelle des indicateurs de résultats.
--
-- Les indicateurs sont calculés depuis les dossiers terminés et les
-- questionnaires de satisfaction. Un organisme qui arrive sur Capsule a
-- pourtant déjà un historique — années précédentes, outil précédent — et la
-- fiche publique de ses formations ne peut pas rester vide en attendant que la
-- plateforme accumule des données. L'indicateur Qualiopi 2 exige des résultats
-- publiés.
--
-- Une déclaration porte sur une **année**, au niveau de l'organisme
-- (`formation_id IS NULL`) ou d'une formation précise. Chaque colonne est
-- optionnelle : on ne déclare que ce qu'on connaît, le reste continue d'être
-- calculé.
--
-- `source` est libre et obligatoire à la saisie côté application : en contrôle
-- Qualiopi, un chiffre déclaré doit pouvoir être rattaché à sa provenance
-- (« export Digiforma 2024 », « registre interne »).

CREATE TABLE app.declared_indicators (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  formation_id            UUID REFERENCES app.formations(id) ON DELETE CASCADE,
  year                    INT  NOT NULL CHECK (year BETWEEN 2000 AND 2100),

  learners_trained        INT     CHECK (learners_trained >= 0),
  satisfaction_rate       NUMERIC(5,2) CHECK (satisfaction_rate BETWEEN 0 AND 100),
  satisfaction_responses  INT     CHECK (satisfaction_responses >= 0),
  response_rate           NUMERIC(5,2) CHECK (response_rate BETWEEN 0 AND 100),
  formations_delivered    INT     CHECK (formations_delivered >= 0),

  source                  TEXT NOT NULL CHECK (length(btrim(source)) BETWEEN 1 AND 200),
  note                    TEXT CHECK (note IS NULL OR length(note) <= 1000),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES app.members(id) ON DELETE SET NULL
);

-- Une seule déclaration par périmètre. Deux index partiels, `formation_id`
-- pouvant être NULL — une contrainte UNIQUE ordinaire ne distinguerait pas les
-- lignes globales entre elles.
CREATE UNIQUE INDEX ux_declared_indicators_org_year
  ON app.declared_indicators(organization_id, year)
  WHERE formation_id IS NULL;

CREATE UNIQUE INDEX ux_declared_indicators_formation_year
  ON app.declared_indicators(organization_id, formation_id, year)
  WHERE formation_id IS NOT NULL;

CREATE INDEX ix_declared_indicators_org ON app.declared_indicators(organization_id, year);

ALTER TABLE app.declared_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.declared_indicators FORCE ROW LEVEL SECURITY;

CREATE POLICY declared_indicators_select ON app.declared_indicators FOR SELECT TO authenticated
USING (organization_id = app.current_organization_id());

CREATE POLICY declared_indicators_insert ON app.declared_indicators FOR INSERT TO authenticated
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY declared_indicators_update ON app.declared_indicators FOR UPDATE TO authenticated
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY declared_indicators_delete ON app.declared_indicators FOR DELETE TO authenticated
USING (organization_id = app.current_organization_id() AND app.is_staff());

COMMENT ON TABLE app.declared_indicators IS
  'Indicateurs de résultats saisis à la main, par année et par formation. Complètent le calcul automatique (audit CAP-24).';

-- ── Fiche publique : les déclarations s'ajoutent au calcul ──────────────────
-- Une formation dont les résultats sont déclarés doit les afficher, sinon la
-- saisie manuelle ne servirait qu'en interne. Le contrat de retour est celui
-- posé en 0127 — mêmes clés, mêmes conditions de publication — enrichi de
-- `declared_source`, qui permet d'indiquer la provenance des chiffres déclarés.
-- Les apprenants et les réponses s'additionnent ; la satisfaction est une
-- moyenne pondérée par le nombre de réponses de chaque source.

CREATE OR REPLACE FUNCTION public.get_published_formation_indicators(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  WITH formation AS (
    SELECT f.id, f.organization_id
    FROM app.formations f
    JOIN app.organizations o ON o.id = f.organization_id
    WHERE f.id = p_id
      AND f.is_published = true
      AND f.deleted_at IS NULL
      AND o.status = 'active'
      AND o.deleted_at IS NULL
  ),
  trained AS (
    SELECT
      count(DISTINCT d.learner_id) AS learners,
      max(d.end_date) AS last_end_date
    FROM app.dossiers d
    JOIN formation f ON f.id = d.formation_id
    WHERE d.status IN ('completed', 'closed', 'archived')
      AND d.deleted_at IS NULL
  ),
  satisfaction AS (
    SELECT
      round(avg(r.score))::int AS rate,
      count(*)::int AS responses
    FROM app.questionnaire_responses r
    JOIN app.dossiers d ON d.id = r.dossier_id
    JOIN formation f ON f.id = d.formation_id
    JOIN app.questionnaire_templates t ON t.id = r.template_id
    WHERE t.kind IN ('satisfaction_chaud', 'satisfaction_froid')
      AND r.score IS NOT NULL
      AND d.deleted_at IS NULL
  ),
  declare AS (
    SELECT
      COALESCE(sum(di.learners_trained), 0)::int       AS learners,
      COALESCE(sum(di.satisfaction_responses), 0)::int AS responses,
      sum(di.satisfaction_rate * di.satisfaction_responses) AS points,
      string_agg(DISTINCT di.source, ' · ')            AS sources
    FROM app.declared_indicators di
    JOIN formation f ON f.id = di.formation_id AND f.organization_id = di.organization_id
  )
  SELECT jsonb_build_object(
    'learners', COALESCE(trained.learners, 0) + declare.learners,
    'satisfaction_rate',
      CASE
        WHEN COALESCE(satisfaction.responses, 0) + declare.responses = 0 THEN NULL
        ELSE round(
          (COALESCE(satisfaction.rate, 0)::numeric * COALESCE(satisfaction.responses, 0)
           + COALESCE(declare.points, 0))
          / (COALESCE(satisfaction.responses, 0) + declare.responses)
        )::int
      END,
    'satisfaction_responses', COALESCE(satisfaction.responses, 0) + declare.responses,
    'last_session_end', trained.last_end_date,
    'declared_source', declare.sources
  )
  FROM formation, trained, satisfaction, declare;
$$;

REVOKE ALL ON FUNCTION public.get_published_formation_indicators(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_formation_indicators(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
