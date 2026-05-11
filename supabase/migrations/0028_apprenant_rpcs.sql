-- ============================================================================
-- 0028 — RPCs espace apprenant (dashboard + réclamations)
-- ============================================================================
-- Le token JWT apprenant (HS256, TTL 90j) est vérifié côté Next.js.
-- Une fois validé, learner_id + organization_id sont passés à ces RPCs.
-- Sécurité = JWT validé, pas RLS (apprenant n'a pas de session Supabase).

-- ── RPC : dashboard apprenant ───────────────────────────────────────────────
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
      WHERE d.learner_id = p_learner_id
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
      WHERE d.learner_id = p_learner_id
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
      WHERE d.learner_id = p_learner_id
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
      WHERE d.learner_id = p_learner_id
      ORDER BY dt.created_at ASC
      LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION app.get_apprenant_dashboard(UUID) TO anon, authenticated;


-- ── RPC : réclamations + timeline pour un apprenant ────────────────────────
CREATE OR REPLACE FUNCTION app.get_learner_complaints(
  p_learner_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COALESCE(jsonb_agg(c_row ORDER BY (c_row->>'created_at') DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', c.id,
      'reference', c.reference,
      'subject', c.subject,
      'description', c.description,
      'status', c.status::text,
      'severity', c.severity,
      'category', COALESCE(c.metadata->>'category_label', c.metadata->>'category', 'Autre'),
      'created_at', c.created_at,
      'resolved_at', c.resolved_at,
      'resolution', c.resolution,
      'events', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', e.kind,
          'occurred_at', e.occurred_at,
          'payload', e.payload
        ) ORDER BY e.occurred_at ASC)
        FROM app.complaint_events e
        WHERE e.complaint_id = c.id
      ), '[]'::jsonb)
    ) AS c_row
    FROM app.complaints c
    WHERE c.learner_id = p_learner_id
      AND c.deleted_at IS NULL
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION app.get_learner_complaints(UUID) TO anon, authenticated;


-- ── RPC : soumission de réclamation par l'apprenant ─────────────────────────
-- Appelée par Server Action côté Next avec service_role (token JWT vérifié).
CREATE OR REPLACE FUNCTION app.submit_learner_complaint(
  p_learner_id UUID,
  p_organization_id UUID,
  p_dossier_id UUID,
  p_subject TEXT,
  p_description TEXT,
  p_category TEXT,
  p_category_label TEXT,
  p_reporter_name TEXT,
  p_reporter_email TEXT,
  p_ip INET,
  p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_reference TEXT;
  v_complaint_id UUID;
BEGIN
  IF length(trim(p_subject)) < 3 THEN
    RAISE EXCEPTION 'subject_too_short' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(p_description)) < 10 THEN
    RAISE EXCEPTION 'description_too_short' USING ERRCODE = 'P0001';
  END IF;

  v_reference := 'REC-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO app.complaints (
    organization_id,
    reference,
    dossier_id,
    learner_id,
    source,
    channel,
    reporter_name,
    reporter_email,
    subject,
    description,
    severity,
    status,
    metadata
  ) VALUES (
    p_organization_id,
    v_reference,
    p_dossier_id,
    p_learner_id,
    'questionnaire',
    'espace_apprenant',
    p_reporter_name,
    p_reporter_email,
    p_subject,
    p_description,
    'medium',
    'open',
    jsonb_build_object(
      'category', p_category,
      'category_label', p_category_label,
      'submitted_from', 'espace_apprenant',
      'ip_address', p_ip::text,
      'user_agent', p_user_agent
    )
  )
  RETURNING id INTO v_complaint_id;

  -- Événement initial dans la timeline
  INSERT INTO app.complaint_events (
    organization_id,
    complaint_id,
    kind,
    payload
  ) VALUES (
    p_organization_id,
    v_complaint_id,
    'comment',
    jsonb_build_object(
      'by', p_reporter_name,
      'text', 'Réclamation envoyée depuis l''espace apprenant.',
      'from_learner', true
    )
  );

  RETURN jsonb_build_object(
    'id', v_complaint_id,
    'reference', v_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION app.submit_learner_complaint(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.submit_learner_complaint(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INET, TEXT) TO service_role;
