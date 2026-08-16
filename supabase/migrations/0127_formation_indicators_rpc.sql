-- 0127 — Indicateurs de résultats publics d'une formation
--
-- Les « indicateurs de résultats » du catalogue étaient un champ de texte libre
-- à tenir à jour à la main. Cette RPC les calcule depuis les données réelles de
-- la plateforme (dossiers terminés + questionnaires de satisfaction), pour que
-- la page programme publique affiche des chiffres à jour sans saisie.
--
-- SECURITY DEFINER + grant anon, comme 0109/0126 : la fonction ne renvoie que
-- des AGRÉGATS (compteurs et moyenne) — aucune donnée nominative — et
-- uniquement pour une formation publiée d'un organisme actif.

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
  )
  SELECT jsonb_build_object(
    'learners', COALESCE(trained.learners, 0),
    'satisfaction_rate', satisfaction.rate,
    'satisfaction_responses', COALESCE(satisfaction.responses, 0),
    'last_session_end', trained.last_end_date
  )
  FROM formation, trained, satisfaction;
$$;

REVOKE ALL ON FUNCTION public.get_published_formation_indicators(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_formation_indicators(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
