-- ============================================================================
-- 0050 — Moteur Qualiopi : calcul des compteurs + recompute + gate transition
-- ============================================================================

-- Évalue chaque indicateur dossier-scope, upsert le snapshot et renvoie les
-- compteurs. Ne touche PAS app.dossiers (appelable depuis un trigger BEFORE).
CREATE OR REPLACE FUNCTION app.eval_qualiopi_counts(
  p_dossier_id UUID,
  OUT total INT,
  OUT satisfied INT,
  OUT entry_blocking_missing INT,
  OUT closing_blocking_missing INT,
  OUT blocking_missing INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org UUID;
  v_details JSONB;
BEGIN
  SELECT organization_id INTO v_org FROM app.dossiers WHERE id = p_dossier_id;

  WITH resolved AS (
    SELECT
      i.id AS indicator_id,
      i.number,
      COALESCE(orul.stage, srul.stage, 'none')                      AS stage,
      COALESCE(orul.is_blocking, srul.is_blocking, false)           AS is_blocking,
      COALESCE(orul.satisfaction_source, srul.satisfaction_source, 'proof') AS source
    FROM app.qualiopi_indicators i
    LEFT JOIN app.qualiopi_indicator_rules srul
      ON srul.indicator_id = i.id AND srul.organization_id IS NULL
     AND srul.is_active AND srul.deleted_at IS NULL
    LEFT JOIN app.qualiopi_indicator_rules orul
      ON orul.indicator_id = i.id AND orul.organization_id = v_org
     AND orul.is_active AND orul.deleted_at IS NULL
    WHERE i.scope = 'dossier' AND i.is_active
  ),
  evaluated AS (
    SELECT r.*,
      CASE r.source
        WHEN 'proof' THEN EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id AND p.indicator_id = r.indicator_id
            AND p.deleted_at IS NULL
            AND (p.valid_from  IS NULL OR p.valid_from  <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        WHEN 'questionnaire_positionnement' THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
            AND qa.status = 'completed')
        WHEN 'questionnaire_evaluation' THEN EXISTS (
          SELECT 1 FROM app.questionnaire_assignments qa
          JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
          WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
            AND qa.status = 'completed')
        WHEN 'attendance_signed' THEN (
          EXISTS (SELECT 1 FROM app.attendance_sheets s WHERE s.dossier_id = p_dossier_id)
          AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets s
                          WHERE s.dossier_id = p_dossier_id AND s.status <> 'finalized'))
        WHEN 'document_signed' THEN EXISTS (
          SELECT 1 FROM app.documents d
          JOIN app.document_signatures ds ON ds.document_id = d.id
          WHERE d.dossier_id = p_dossier_id AND ds.status = 'signed')
      END AS is_satisfied
    FROM resolved r
  )
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE is_satisfied)::int,
    count(*) FILTER (WHERE stage = 'entry'   AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE stage = 'closing' AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE is_blocking AND NOT is_satisfied)::int,
    COALESCE(jsonb_agg(jsonb_build_object(
      'indicator_id', indicator_id, 'number', number, 'stage', stage,
      'is_blocking', is_blocking, 'satisfied', is_satisfied, 'source', source
    ) ORDER BY number), '[]'::jsonb)
  INTO total, satisfied, entry_blocking_missing, closing_blocking_missing,
       blocking_missing, v_details
  FROM evaluated;

  INSERT INTO app.qualiopi_dossier_checklists AS c (
    dossier_id, organization_id, computed_at, total_indicators,
    satisfied_indicators, blocking_missing, entry_blocking_missing,
    closing_blocking_missing, details
  )
  VALUES (
    p_dossier_id, v_org, now(), total, satisfied, blocking_missing,
    entry_blocking_missing, closing_blocking_missing, v_details
  )
  ON CONFLICT (dossier_id) DO UPDATE SET
    computed_at = now(),
    total_indicators = EXCLUDED.total_indicators,
    satisfied_indicators = EXCLUDED.satisfied_indicators,
    blocking_missing = EXCLUDED.blocking_missing,
    entry_blocking_missing = EXCLUDED.entry_blocking_missing,
    closing_blocking_missing = EXCLUDED.closing_blocking_missing,
    details = EXCLUDED.details;
END $$;

REVOKE ALL ON FUNCTION app.eval_qualiopi_counts(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.eval_qualiopi_counts(UUID) TO service_role;

-- Wrapper : eval + maj dossiers.qualiopi_ready (UI / handlers d'events).
CREATE OR REPLACE FUNCTION app.recompute_qualiopi_checklist(p_dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM app.eval_qualiopi_counts(p_dossier_id);
  UPDATE app.dossiers SET qualiopi_ready = (r.blocking_missing = 0)
  WHERE id = p_dossier_id;
END $$;

REVOKE ALL ON FUNCTION app.recompute_qualiopi_checklist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recompute_qualiopi_checklist(UUID) TO service_role;

-- Wrapper public pour exposition PostgREST (cron via rpc()).
CREATE OR REPLACE FUNCTION public.recompute_qualiopi_checklist(p_dossier_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = app, public
AS $$ SELECT app.recompute_qualiopi_checklist(p_dossier_id) $$;

REVOKE ALL ON FUNCTION public.recompute_qualiopi_checklist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_qualiopi_checklist(UUID) TO service_role;

-- Gate incontournable : recalcule au moment de la transition, bloque si besoin.
CREATE OR REPLACE FUNCTION app.tg_qualiopi_transition_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  r RECORD;
  v_missing TEXT;
BEGIN
  SELECT * INTO r FROM app.eval_qualiopi_counts(NEW.id);
  NEW.qualiopi_ready := (r.blocking_missing = 0);

  IF NEW.status = 'active' AND OLD.status <> 'active'
     AND r.entry_blocking_missing > 0 THEN
    SELECT string_agg(d->>'number', ', ' ORDER BY (d->>'number')::int)
      INTO v_missing
    FROM app.qualiopi_dossier_checklists c,
         jsonb_array_elements(c.details) d
    WHERE c.dossier_id = NEW.id
      AND d->>'stage' = 'entry' AND (d->>'is_blocking')::boolean
      AND NOT (d->>'satisfied')::boolean;
    RAISE EXCEPTION 'qualiopi_entry_blocked: indicateurs % manquants', v_missing
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'closed' AND OLD.status <> 'closed'
     AND r.closing_blocking_missing > 0 THEN
    SELECT string_agg(d->>'number', ', ' ORDER BY (d->>'number')::int)
      INTO v_missing
    FROM app.qualiopi_dossier_checklists c,
         jsonb_array_elements(c.details) d
    WHERE c.dossier_id = NEW.id
      AND d->>'stage' = 'closing' AND (d->>'is_blocking')::boolean
      AND NOT (d->>'satisfied')::boolean;
    RAISE EXCEPTION 'qualiopi_closing_blocked: indicateurs % manquants', v_missing
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER tg_dossiers_qualiopi_gate
BEFORE UPDATE OF status ON app.dossiers
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION app.tg_qualiopi_transition_gate();
