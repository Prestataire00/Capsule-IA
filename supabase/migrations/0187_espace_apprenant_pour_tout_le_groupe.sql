-- 0187 — Deux stagiaires sur trois n'avaient aucun espace apprenant
--
-- Constat (recette de bout en bout du 20/09/2026, reproduit en base) : sur un
-- dossier de trois stagiaires, seul le titulaire ouvrait son espace. Les deux
-- autres — pourtant rattachés au dossier et inscrits à toutes les séances —
-- recevaient une page « introuvable » : ni séances, ni documents, ni
-- attestation, ni quiz.
--
-- Cause : `app.get_apprenant_dashboard` (0028) cherche le dossier par
-- `d.learner_id = p_learner_id`, l'ancien modèle « un dossier = un apprenant ».
-- La 0175 a introduit le groupe (`app.dossier_learners`) sans reprendre cette
-- fonction — ni les trois autres sous-requêtes qui portent la même clause
-- (séances, modules, formateur).
--
-- Correction : les dossiers de l'apprenant sont ceux où il est titulaire OU
-- membre du groupe. Le corps de la fonction est repris mot pour mot de la
-- 0028 ; seule la clause de rattachement change, aux quatre endroits.
--
-- Rejouable sans risque.

-- Dossiers d'un apprenant : titulaire d'hier, membre du groupe aujourd'hui.
CREATE OR REPLACE FUNCTION app.apprenant_dossier_ids(p_learner_id UUID)
RETURNS TABLE(dossier_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT d.id FROM app.dossiers d
   WHERE d.learner_id = p_learner_id AND d.deleted_at IS NULL
  UNION
  SELECT dl.dossier_id FROM app.dossier_learners dl
    JOIN app.dossiers d2 ON d2.id = dl.dossier_id AND d2.deleted_at IS NULL
   WHERE dl.learner_id = p_learner_id
$$;

COMMENT ON FUNCTION app.apprenant_dossier_ids(UUID) IS
  'Dossiers rattachés à un apprenant : titulaire (modèle d''origine) ou membre du groupe (app.dossier_learners, 0175).';

REVOKE ALL ON FUNCTION app.apprenant_dossier_ids(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.apprenant_dossier_ids(UUID) TO service_role;

CREATE OR REPLACE FUNCTION app.get_apprenant_dashboard(
  p_learner_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT jsonb_build_object(
    'learner', (
      SELECT jsonb_build_object(
        'id', l.id,
        'first_name', l.first_name,
        'last_name', l.last_name,
        'email', l.email::text,
        'has_rqth', COALESCE((l.metadata->>'has_rqth')::boolean, false)
      )
      FROM app.learners l WHERE l.id = p_learner_id
    ),
    'organization', (
      SELECT jsonb_build_object(
        'id', o.id,
        'name', o.name
      )
      FROM app.organizations o
      JOIN app.learners l ON l.organization_id = o.id
      WHERE l.id = p_learner_id
    ),
    'dossier', (
      SELECT jsonb_build_object(
        'id', d.id,
        'reference', d.reference,
        'status', d.status::text,
        'modality', d.modality::text,
        'start_date', d.start_date,
        'end_date', d.end_date,
        'total_hours', d.total_hours,
        'formation', jsonb_build_object(
          'id', f.id,
          'title', f.title,
          'summary', f.summary,
          'description', f.description,
          'objectives', f.objectives
        )
      )
      FROM app.dossiers d
      JOIN app.formations f ON f.id = d.formation_id
      WHERE d.id IN (SELECT ad.dossier_id FROM app.apprenant_dossier_ids(p_learner_id) ad)
      ORDER BY d.start_date DESC
      LIMIT 1
    ),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'status', s.status::text,
        'modality', s.modality::text,
        'location', s.location,
        'remote_url', s.remote_url,
        'title', s.title
      ) ORDER BY s.starts_at ASC)
      FROM app.sessions s
      JOIN app.dossiers d ON d.id = s.dossier_id
      WHERE d.id IN (SELECT ad.dossier_id FROM app.apprenant_dossier_ids(p_learner_id) ad)
    ), '[]'::jsonb),
    'modules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', dm.id,
        'title', dm.title_snapshot,
        'position', dm.position,
        'duration_hours', dm.duration_hours,
        'start_date', dm.start_date
      ) ORDER BY dm.position ASC)
      FROM app.dossier_modules dm
      JOIN app.dossiers d ON d.id = dm.dossier_id
      WHERE d.id IN (SELECT ad.dossier_id FROM app.apprenant_dossier_ids(p_learner_id) ad)
    ), '[]'::jsonb),
    'trainer', (
      SELECT jsonb_build_object(
        'first_name', t.first_name,
        'last_name', t.last_name,
        'email', t.email::text
      )
      FROM app.trainers t
      JOIN app.dossier_trainers dt ON dt.trainer_id = t.id
      JOIN app.dossiers d ON d.id = dt.dossier_id
      WHERE d.id IN (SELECT ad.dossier_id FROM app.apprenant_dossier_ids(p_learner_id) ad)
      ORDER BY dt.created_at ASC
      LIMIT 1
    )
  );
$$;

