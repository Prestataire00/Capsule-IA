-- 0126 — Formateur par défaut exposé sur la page programme publique
--
-- L'équipe pédagogique du catalogue était du texte libre recopié à la main : la
-- photo et la description du formateur vivaient sur sa fiche sans jamais en
-- sortir. La RPC publique renvoie désormais le formateur par défaut de la
-- formation (metadata.catalog.defaultTrainerId), pour que le catalogue affiche
-- son profil et reste synchrone avec sa fiche.
--
-- Seuls nom, photo et description sortent — jamais l'email, le téléphone, le
-- SIRET ni le CV (données personnelles / preuves internes).

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
    'default_trainer', (
      SELECT jsonb_build_object(
        'first_name', t.first_name,
        'last_name', t.last_name,
        'bio', t.bio,
        'photo_path', t.photo_path
      )
      FROM app.trainers t
      WHERE t.id = (f.metadata #>> '{catalog,defaultTrainerId}')::uuid
        AND t.organization_id = f.organization_id
        AND t.deleted_at IS NULL
    ),
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
GRANT EXECUTE ON FUNCTION public.get_published_formation_full(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
