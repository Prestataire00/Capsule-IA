-- Formations « sur mesure » : une formation montée pour UN client précis, hors
-- catalogue, avec son propre tarif. L'organisme travaille en BtoB (entreprise
-- cliente) comme en BtoC (particulier) : la formation porte donc son client.
--
-- `client_kind` NULL = formation de catalogue (le cas courant, inchangé).
-- Les formations sur mesure n'apparaissent pas dans le catalogue public.

ALTER TABLE app.formations
  ADD COLUMN IF NOT EXISTS client_kind TEXT,
  ADD COLUMN IF NOT EXISTS client_company_id UUID REFERENCES app.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_learner_id UUID REFERENCES app.learners(id) ON DELETE SET NULL;

-- Cohérence : soit catalogue (aucun client), soit entreprise, soit particulier.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'formations_client_coherent'
  ) THEN
    ALTER TABLE app.formations
      ADD CONSTRAINT formations_client_coherent CHECK (
        (client_kind IS NULL AND client_company_id IS NULL AND client_learner_id IS NULL)
        OR (client_kind = 'company' AND client_company_id IS NOT NULL AND client_learner_id IS NULL)
        OR (client_kind = 'individual' AND client_learner_id IS NOT NULL AND client_company_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_formations_client_company
  ON app.formations (client_company_id) WHERE client_company_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_formations_client_learner
  ON app.formations (client_learner_id) WHERE client_learner_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN app.formations.client_kind IS
  'NULL = formation de catalogue. « company » = sur mesure pour une entreprise (BtoB), « individual » = sur mesure pour un particulier (BtoC).';
COMMENT ON COLUMN app.formations.client_company_id IS
  'Entreprise cliente d''une formation sur mesure (client_kind = company).';
COMMENT ON COLUMN app.formations.client_learner_id IS
  'Apprenant particulier client d''une formation sur mesure (client_kind = individual).';

-- Garde-fou : une formation sur mesure ne doit jamais sortir au catalogue public,
-- même si quelqu'un la publie depuis la fiche formation.
CREATE OR REPLACE FUNCTION public.list_published_formations(p_org uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  code text,
  title text,
  default_modality text,
  default_duration_hours numeric,
  category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  SELECT f.id, f.organization_id, f.code, f.title,
         f.default_modality::text, f.default_duration_hours, f.metadata->>'category'
  FROM app.formations f
  JOIN app.organizations o ON o.id = f.organization_id
  WHERE f.organization_id = p_org
    AND f.is_published = true
    AND f.deleted_at IS NULL
    AND f.client_kind IS NULL
    AND o.status = 'active'
    AND o.deleted_at IS NULL
  ORDER BY f.code;
$$;

REVOKE ALL ON FUNCTION public.list_published_formations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_published_formations(uuid) TO anon, authenticated;
