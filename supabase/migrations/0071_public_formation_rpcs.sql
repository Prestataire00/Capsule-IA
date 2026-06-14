-- ============================================================================
-- 0071 — RPC publiques (anon) pour la page d'inscription
-- ============================================================================
-- La page /inscription est anonyme (pas de JWT → pas d'org). Les policies RLS
-- de app.formations exigent l'org du JWT, donc anon ne peut rien lire en direct.
-- On expose une surface CONTRÔLÉE via SECURITY DEFINER : uniquement les
-- formations PUBLIÉES, d'un OF ACTIF. Le périmètre est org-scopé : on résout
-- l'OF depuis la formation du lien, puis on liste son catalogue publié.

-- Une seule formation publiée (résout l'OF du lien d'inscription).
CREATE OR REPLACE FUNCTION public.get_published_formation(p_id uuid)
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
  WHERE f.id = p_id
    AND f.is_published = true
    AND f.deleted_at IS NULL
    AND o.status = 'active'
    AND o.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_published_formation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_formation(uuid) TO anon, authenticated;

-- Catalogue publié d'un OF (org-scopé).
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
    AND o.status = 'active'
    AND o.deleted_at IS NULL
  ORDER BY f.code;
$$;

REVOKE ALL ON FUNCTION public.list_published_formations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_published_formations(uuid) TO anon, authenticated;
