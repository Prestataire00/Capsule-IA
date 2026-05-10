-- ============================================================================
-- 0024 — RPC save_dossier(jsonb, jsonb[]) : atomicité agrégat + outbox
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_dossier(p_dossier jsonb, p_events jsonb[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, infra
AS $$
DECLARE
  v_org uuid := (p_dossier->>'organization_id')::uuid;
  v_id  uuid := (p_dossier->>'id')::uuid;
  v_event jsonb;
  v_module jsonb;
  v_trainer jsonb;
  v_funder jsonb;
BEGIN
  IF v_org IS NULL OR v_org <> app.current_organization_id() THEN
    RAISE EXCEPTION 'forbidden: organization_id mismatch' USING ERRCODE = '42501';
  END IF;

  INSERT INTO app.dossiers (
    id, organization_id, reference, learner_id, company_id, formation_id,
    formation_snapshot, status, modality, start_date, end_date,
    total_hours, total_amount_cents, currency, notes, metadata,
    closed_at, cancelled_at, cancellation_reason, updated_by
  )
  VALUES (
    v_id, v_org,
    p_dossier->>'reference',
    (p_dossier->>'learner_id')::uuid,
    NULLIF(p_dossier->>'company_id','')::uuid,
    (p_dossier->>'formation_id')::uuid,
    COALESCE(p_dossier->'formation_snapshot', '{}'::jsonb),
    (p_dossier->>'status')::app.dossier_status,
    (p_dossier->>'modality')::app.training_modality,
    (p_dossier->>'start_date')::date,
    (p_dossier->>'end_date')::date,
    (p_dossier->>'total_hours')::numeric,
    NULLIF(p_dossier->>'total_amount_cents','')::bigint,
    COALESCE(p_dossier->>'currency','EUR'),
    p_dossier->>'notes',
    COALESCE(p_dossier->'metadata', '{}'::jsonb),
    NULLIF(p_dossier->>'closed_at','')::timestamptz,
    NULLIF(p_dossier->>'cancelled_at','')::timestamptz,
    p_dossier->>'cancellation_reason',
    auth.uid()
  )
  ON CONFLICT (id) DO UPDATE SET
    learner_id           = EXCLUDED.learner_id,
    company_id           = EXCLUDED.company_id,
    formation_id         = EXCLUDED.formation_id,
    status               = EXCLUDED.status,
    modality             = EXCLUDED.modality,
    start_date           = EXCLUDED.start_date,
    end_date             = EXCLUDED.end_date,
    total_hours          = EXCLUDED.total_hours,
    total_amount_cents   = EXCLUDED.total_amount_cents,
    currency             = EXCLUDED.currency,
    notes                = EXCLUDED.notes,
    metadata             = EXCLUDED.metadata,
    closed_at            = EXCLUDED.closed_at,
    cancelled_at         = EXCLUDED.cancelled_at,
    cancellation_reason  = EXCLUDED.cancellation_reason,
    updated_by           = EXCLUDED.updated_by,
    updated_at           = now();

  IF p_dossier ? 'modules' THEN
    DELETE FROM app.dossier_modules
    WHERE dossier_id = v_id
      AND id NOT IN (
        SELECT (m->>'id')::uuid FROM jsonb_array_elements(p_dossier->'modules') m
      );
    FOR v_module IN SELECT * FROM jsonb_array_elements(p_dossier->'modules')
    LOOP
      INSERT INTO app.dossier_modules (
        id, organization_id, dossier_id, module_id, position, title_snapshot,
        duration_hours, start_date, end_date
      )
      VALUES (
        (v_module->>'id')::uuid, v_org, v_id,
        (v_module->>'module_id')::uuid,
        (v_module->>'position')::int,
        v_module->>'title_snapshot',
        (v_module->>'duration_hours')::numeric,
        NULLIF(v_module->>'start_date','')::date,
        NULLIF(v_module->>'end_date','')::date
      )
      ON CONFLICT (id) DO UPDATE SET
        position       = EXCLUDED.position,
        title_snapshot = EXCLUDED.title_snapshot,
        duration_hours = EXCLUDED.duration_hours,
        start_date     = EXCLUDED.start_date,
        end_date       = EXCLUDED.end_date,
        updated_at     = now();
    END LOOP;
  END IF;

  IF p_dossier ? 'trainers' THEN
    DELETE FROM app.dossier_trainers
    WHERE dossier_id = v_id
      AND trainer_id NOT IN (
        SELECT (t->>'trainer_id')::uuid FROM jsonb_array_elements(p_dossier->'trainers') t
      );
    FOR v_trainer IN SELECT * FROM jsonb_array_elements(p_dossier->'trainers')
    LOOP
      INSERT INTO app.dossier_trainers (
        dossier_id, trainer_id, organization_id, is_lead, hourly_rate_cents
      )
      VALUES (
        v_id, (v_trainer->>'trainer_id')::uuid, v_org,
        (v_trainer->>'is_lead')::boolean,
        NULLIF(v_trainer->>'hourly_rate_cents','')::bigint
      )
      ON CONFLICT (dossier_id, trainer_id) DO UPDATE SET
        is_lead           = EXCLUDED.is_lead,
        hourly_rate_cents = EXCLUDED.hourly_rate_cents;
    END LOOP;
  END IF;

  IF p_dossier ? 'funders' THEN
    DELETE FROM app.dossier_funders
    WHERE dossier_id = v_id
      AND id NOT IN (
        SELECT (f->>'id')::uuid FROM jsonb_array_elements(p_dossier->'funders') f
      );
    FOR v_funder IN SELECT * FROM jsonb_array_elements(p_dossier->'funders')
    LOOP
      INSERT INTO app.dossier_funders (
        id, organization_id, dossier_id, funder_id,
        amount_cents, share_percent, status
      )
      VALUES (
        (v_funder->>'id')::uuid, v_org, v_id,
        (v_funder->>'funder_id')::uuid,
        (v_funder->>'amount_cents')::bigint,
        NULLIF(v_funder->>'share_percent','')::numeric,
        COALESCE(v_funder->>'status','pending')
      )
      ON CONFLICT (id) DO UPDATE SET
        amount_cents  = EXCLUDED.amount_cents,
        share_percent = EXCLUDED.share_percent,
        status        = EXCLUDED.status,
        updated_at    = now();
    END LOOP;
  END IF;

  IF p_events IS NOT NULL AND array_length(p_events, 1) > 0 THEN
    FOREACH v_event IN ARRAY p_events
    LOOP
      INSERT INTO infra.domain_events (
        id, organization_id, aggregate_type, aggregate_id, type, version,
        payload, correlation_id, causation_id, actor_user_id, occurred_at
      )
      VALUES (
        (v_event->>'id')::uuid,
        (v_event->>'organization_id')::uuid,
        v_event->>'aggregate_type',
        (v_event->>'aggregate_id')::uuid,
        v_event->>'type',
        COALESCE((v_event->>'version')::int, 1),
        COALESCE(v_event->'payload', '{}'::jsonb),
        NULLIF(v_event->>'correlation_id','')::uuid,
        NULLIF(v_event->>'causation_id','')::uuid,
        NULLIF(v_event->>'actor_user_id','')::uuid,
        COALESCE(NULLIF(v_event->>'occurred_at','')::timestamptz, now())
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'events_count', COALESCE(array_length(p_events, 1), 0));
END $$;

REVOKE ALL ON FUNCTION public.save_dossier(jsonb, jsonb[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_dossier(jsonb, jsonb[]) TO authenticated, service_role;

-- RPC helper pour le dispatcher d'events
CREATE OR REPLACE FUNCTION public.claim_events_for_dispatch(p_batch int DEFAULT 50)
RETURNS SETOF infra.domain_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, infra
AS $$
  SELECT *
  FROM infra.domain_events
  WHERE dispatched_at IS NULL
    AND (next_retry_at IS NULL OR next_retry_at <= now())
  ORDER BY occurred_at
  LIMIT p_batch
  FOR UPDATE SKIP LOCKED
$$;
REVOKE ALL ON FUNCTION public.claim_events_for_dispatch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_events_for_dispatch(int) TO service_role;
