-- ============================================================================
-- 0081 — RPC exercices apprenant
-- ============================================================================
-- Token JWT apprenant vérifié côté Next.js ; learner_id passé ici.
-- Renvoie en JSONB, pour le dossier actif de l'apprenant :
--   • liste des exercices publiés, triés par due_at NULLS LAST puis created_at
--   • pour chaque exercice, la soumission de cet apprenant (ou null)

CREATE OR REPLACE FUNCTION app.get_apprenant_exercises(p_learner_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH dossier_actif AS (
    SELECT d.id AS dossier_id
    FROM app.dossiers d
    WHERE d.learner_id = p_learner_id
    ORDER BY d.start_date DESC
    LIMIT 1
  )
  SELECT COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',             ex.id,
          'title',          ex.title,
          'instructions',   ex.instructions,
          'due_at',         ex.due_at,
          'module_id',      ex.module_id,
          'has_attachment', (ex.attachment_path IS NOT NULL),
          'submission',     CASE
            WHEN sub.id IS NOT NULL THEN jsonb_build_object(
              'status',       sub.status,
              'grade',        sub.grade,
              'feedback',     sub.feedback,
              'submitted_at', sub.submitted_at,
              'has_file',     (sub.file_path IS NOT NULL)
            )
            ELSE NULL
          END
        )
        ORDER BY ex.due_at NULLS LAST, ex.created_at
      )
      FROM app.exercises ex
      CROSS JOIN dossier_actif da
      LEFT JOIN app.exercise_submissions sub
        ON sub.exercise_id = ex.id
       AND sub.learner_id  = p_learner_id
      WHERE ex.dossier_id   = da.dossier_id
        AND ex.is_published = true
        AND ex.deleted_at   IS NULL
    ),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION app.get_apprenant_exercises(UUID) TO anon, authenticated, service_role;
