-- ============================================================================
-- 0109 — RPC publique « formation complète » pour la page programme publique
-- ============================================================================
-- La page programme publique (/catalogue/<id>) doit rendre le programme complet
-- d'une formation PUBLIÉE sans session : titre, contenu pédagogique, metadata
-- (dont metadata.catalog.programme = programme personnalisé), et l'identité de
-- l'OF pour le pied de page légal. Les RPC 0071 ne renvoyaient que 7 colonnes.
--
-- Renvoie un jsonb unique (formation + organization imbriquée). SECURITY DEFINER,
-- granted anon : lecture publique bornée aux formations publiées d'un OF actif —
-- aucune fuite (RLS contournée mais filtre is_published + org active en dur).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_published_formation_full(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
  SELECT jsonb_build_object(
    'id', f.id,
    'organization_id', f.organization_id,
    'code', f.code,
    'title', f.title,
    'summary', f.summary,
    'description', f.description,
    'objectives', f.objectives,
    'prerequisites', f.prerequisites,
    'target_audience', f.target_audience,
    'evaluation_method', f.evaluation_method,
    'pedagogical_method', f.pedagogical_method,
    'default_modality', f.default_modality::text,
    'default_duration_hours', f.default_duration_hours,
    'default_price_cents', f.default_price_cents,
    'rncp_code', f.rncp_code,
    'rs_code', f.rs_code,
    'certificateur', f.certificateur,
    'metadata', f.metadata,
    'organization', jsonb_build_object(
      'name', o.name,
      'legal_name', o.legal_name,
      'siret', o.siret,
      'naf_code', o.naf_code,
      'declaration_activite', o.declaration_activite,
      'address', o.address,
      'contact_email', o.contact_email,
      'contact_phone', o.contact_phone,
      'logo_path', o.logo_path
    )
  )
  FROM app.formations f
  JOIN app.organizations o ON o.id = f.organization_id
  WHERE f.id = p_id
    AND f.is_published = true
    AND f.deleted_at IS NULL
    AND o.status = 'active'
    AND o.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_published_formation_full(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_formation_full(uuid) TO anon, authenticated;

-- ── Complément d'identité Capsule IA (pied de page légal du programme) ──────
-- 0108 a posé nom/SIRET/adresse ; on complète NDA, NAF, tél et email (bénéficie
-- aussi au cachet auto des documents). Idempotent, même cible que 0108.
UPDATE app.organizations
SET
  naf_code             = COALESCE(naf_code, '8559A'),
  declaration_activite = COALESCE(declaration_activite, '24450461545'),
  contact_phone        = COALESCE(contact_phone, '07 67 93 30 36'),
  contact_email        = COALESCE(contact_email, 'contact@capsule.ia.com'),
  updated_at           = now()
WHERE slug = 'acme-of'
   OR (SELECT count(*) FROM app.organizations) = 1;

-- Rafraîchit le cache de schéma PostgREST (nouvelle fonction visible côté API).
NOTIFY pgrst, 'reload schema';
