-- ============================================================================
-- 0062 — Moteur de suivi des heures + alerte sous-volume + trigger temps réel
-- ============================================================================

CREATE OR REPLACE FUNCTION app.recompute_dossier_hours(p_dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE
  v_org UUID; v_learner UUID; v_total NUMERIC; v_start DATE; v_end DATE; v_aband DATE;
  v_delivered NUMERIC := 0; v_attended NUMERIC := 0; v_remaining NUMERIC := 0;
  v_held INT := 0; v_abs INT := 0; v_abs_j INT := 0;
  v_projected NUMERIC; v_rate NUMERIC; v_at_risk BOOLEAN; v_was_at_risk BOOLEAN;
BEGIN
  SELECT organization_id, learner_id, total_hours, start_date, end_date, abandoned_at
    INTO v_org, v_learner, v_total, v_start, v_end, v_aband
  FROM app.dossiers WHERE id = p_dossier_id;
  IF v_org IS NULL THEN RETURN; END IF;

  WITH sess AS (
    SELECT DISTINCT s.id, s.duration_hours, s.status, s.starts_at, s.ends_at
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
  ),
  classified AS (
    SELECT *,
      (status = 'done' OR ends_at < now())            AS held,
      (v_aband IS NULL OR starts_at::date <= v_aband)  AS in_window
    FROM sess
  )
  SELECT
    COALESCE(sum(duration_hours) FILTER (WHERE held AND in_window), 0),
    COALESCE(sum(duration_hours) FILTER (WHERE NOT held AND in_window AND v_aband IS NULL), 0),
    COUNT(*) FILTER (WHERE held AND in_window)
  INTO v_delivered, v_remaining, v_held
  FROM classified;

  WITH held_sessions AS (
    SELECT DISTINCT s.id, s.duration_hours
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
      AND (s.status = 'done' OR s.ends_at < now())
      AND (v_aband IS NULL OR s.starts_at::date <= v_aband)
  ),
  sigs AS (
    SELECT hs.id, hs.duration_hours,
      bool_or(sig.status IN ('present','late','remote')) AS present,
      bool_or(sig.status = 'absent')           AS absent,
      bool_or(sig.status = 'absent_justified') AS absent_j
    FROM held_sessions hs
    LEFT JOIN app.attendance_sheets sh ON sh.session_id = hs.id
    LEFT JOIN app.attendance_signatures sig
      ON sig.attendance_sheet_id = sh.id
     AND sig.participant_kind = 'learner' AND sig.learner_id = v_learner
    GROUP BY hs.id, hs.duration_hours
  )
  SELECT
    COALESCE(sum(duration_hours) FILTER (WHERE present), 0),
    COUNT(*) FILTER (WHERE absent AND NOT present),
    COUNT(*) FILTER (WHERE absent_j AND NOT present)
  INTO v_attended, v_abs, v_abs_j
  FROM sigs;

  v_projected := v_attended + CASE WHEN v_aband IS NOT NULL THEN 0 ELSE v_remaining END;
  v_rate := CASE WHEN v_delivered > 0 THEN round(v_attended / v_delivered * 100, 2) ELSE 0 END;
  v_at_risk := v_projected < v_total;

  SELECT at_risk INTO v_was_at_risk FROM app.dossier_hours_tracking WHERE dossier_id = p_dossier_id;

  INSERT INTO app.dossier_hours_tracking AS h (
    dossier_id, organization_id, hours_planned, hours_delivered, hours_attended,
    hours_remaining_planned, projected_final_hours, attendance_rate, sessions_held,
    absences_count, justified_absences_count, at_risk, computed_at
  ) VALUES (
    p_dossier_id, v_org, v_total, v_delivered, v_attended, v_remaining, v_projected,
    v_rate, v_held, v_abs, v_abs_j, v_at_risk, now()
  )
  ON CONFLICT (dossier_id) DO UPDATE SET
    hours_planned = EXCLUDED.hours_planned, hours_delivered = EXCLUDED.hours_delivered,
    hours_attended = EXCLUDED.hours_attended, hours_remaining_planned = EXCLUDED.hours_remaining_planned,
    projected_final_hours = EXCLUDED.projected_final_hours, attendance_rate = EXCLUDED.attendance_rate,
    sessions_held = EXCLUDED.sessions_held, absences_count = EXCLUDED.absences_count,
    justified_absences_count = EXCLUDED.justified_absences_count, at_risk = EXCLUDED.at_risk,
    computed_at = now();

  IF v_at_risk AND COALESCE(v_was_at_risk, false) = false THEN
    INSERT INTO app.notifications (organization_id, channel, template_code, subject,
      payload, related_aggregate_type, related_aggregate_id)
    VALUES (v_org, 'in_app', 'dossier_hours_at_risk',
      'Dossier à risque de sous-volume',
      jsonb_build_object('dossier_id', p_dossier_id, 'projected', v_projected, 'planned', v_total),
      'dossier', p_dossier_id);
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.recompute_dossier_hours(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recompute_dossier_hours(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_dossier_hours(p_dossier_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = app, public
AS $$ SELECT app.recompute_dossier_hours(p_dossier_id) $$;
REVOKE ALL ON FUNCTION public.recompute_dossier_hours(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_dossier_hours(UUID) TO service_role;

-- Temps réel : à chaque signature, émet un event léger par dossier lié à la session.
CREATE OR REPLACE FUNCTION app.tg_emit_hours_dirty()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, infra, public
AS $$
DECLARE v_org UUID; v_session UUID;
BEGIN
  SELECT sh.organization_id, sh.session_id INTO v_org, v_session
  FROM app.attendance_sheets sh WHERE sh.id = NEW.attendance_sheet_id;
  IF v_session IS NULL THEN RETURN NEW; END IF;

  INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
  SELECT v_org, 'dossier', sd.dossier_id, 'dossier.hours_dirty',
         jsonb_build_object('dossier_id', sd.dossier_id)
  FROM app.session_dossiers sd WHERE sd.session_id = v_session;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_attendance_sig_hours_dirty
AFTER INSERT OR UPDATE OF status ON app.attendance_signatures
FOR EACH ROW EXECUTE FUNCTION app.tg_emit_hours_dirty();
