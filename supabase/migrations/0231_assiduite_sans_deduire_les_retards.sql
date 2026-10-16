-- L'assiduité ne déduit plus les retards (demande d'Ismael, 16/10/2026 :
-- Nohella, arrivée à 13:45 pour 13:30, n'était pas à 100 % sur son
-- attestation). Un stagiaire présent, même en retard, compte la demi-journée
-- entière. Le retard reste noté sur la feuille d'émargement, et les départs
-- anticipés comme les absences continuent d'être déduits.
-- Seul change, dans app.recompute_dossier_hours (0147), le début du temps
-- suivi : le début de la demi-journée, et non plus l'heure d'arrivée.

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
    -- Durée d'une séance = somme de ses demi-journées (pause déjeuner exclue),
    -- à défaut sa durée brute.
    SELECT DISTINCT s.id,
      COALESCE((SELECT sum(EXTRACT(EPOCH FROM (w.window_end - w.window_start))) / 3600.0
                  FROM app.attendance_sheets sh2
                  CROSS JOIN LATERAL app.attendance_sheet_window(sh2.id) w
                 WHERE sh2.session_id = s.id), s.duration_hours) AS duration_hours,
      s.status, s.starts_at, s.ends_at
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

  -- Chaque feuille (matin, après-midi) vaut sa propre fenêtre ; une présence
  -- partie avant la fin ne compte que le temps effectivement suivi. Un retard,
  -- lui, ne se déduit plus (0231).
  WITH held_sessions AS (
    SELECT DISTINCT s.id
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
      AND (s.status = 'done' OR s.ends_at < now())
      AND (v_aband IS NULL OR s.starts_at::date <= v_aband)
  ),
  feuilles AS (
    SELECT w.window_start, w.window_end, sig.status, sig.late_arrival_time, sig.early_departure_time,
           sig.evidence_source, sig.evidence_payload,
           (w.window_start AT TIME ZONE 'Europe/Paris')::date AS jour
    FROM held_sessions hs
    JOIN app.attendance_sheets sh ON sh.session_id = hs.id
    CROSS JOIN LATERAL app.attendance_sheet_window(sh.id) w
    LEFT JOIN app.attendance_signatures sig
      ON sig.attendance_sheet_id = sh.id
     AND sig.participant_kind = 'learner' AND sig.learner_id = v_learner
  ),
  heures AS (
    SELECT f.status,
      CASE WHEN f.status IN ('present', 'late', 'remote') THEN
        GREATEST(0, EXTRACT(EPOCH FROM (
          LEAST(f.window_end,
                COALESCE((f.jour + f.early_departure_time) AT TIME ZONE 'Europe/Paris',
                         CASE WHEN f.evidence_source IN ('zoom_csv', 'zoom_api') THEN (f.evidence_payload ->> 'leaveTime')::timestamptz END,
                         f.window_end))
          -- Un retard ne retire rien : présent, c'est la demi-journée entière (0231).
          - f.window_start
        )) / 3600.0)
      ELSE 0 END AS h
    FROM feuilles f
  )
  SELECT
    COALESCE(sum(h), 0),
    COUNT(*) FILTER (WHERE status = 'absent'),
    COUNT(*) FILTER (WHERE status = 'absent_justified')
  INTO v_attended, v_abs, v_abs_j
  FROM heures;

  v_projected := v_attended + CASE WHEN v_aband IS NOT NULL THEN 0 ELSE v_remaining END;
  v_rate := CASE WHEN v_delivered > 0 THEN LEAST(100, round(v_attended / v_delivered * 100, 2)) ELSE 0 END;
  v_at_risk := v_projected < v_total;

  SELECT at_risk INTO v_was_at_risk FROM app.dossier_hours_tracking WHERE dossier_id = p_dossier_id;

  INSERT INTO app.dossier_hours_tracking AS h (
    dossier_id, organization_id, hours_planned, hours_delivered, hours_attended,
    hours_remaining_planned, projected_final_hours, attendance_rate, sessions_held,
    absences_count, justified_absences_count, at_risk, computed_at
  ) VALUES (
    p_dossier_id, v_org, COALESCE(v_total, 0), v_delivered, round(v_attended, 2), v_remaining, round(v_projected, 2),
    v_rate, v_held, v_abs, v_abs_j, COALESCE(v_at_risk, false), now()
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

-- Rattrapage : les dossiers dont une présence porte un retard sont recalculés.
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN
    SELECT DISTINCT sd.dossier_id AS id
    FROM app.attendance_signatures sig
    JOIN app.attendance_sheets sh ON sh.id = sig.attendance_sheet_id
    JOIN app.session_dossiers sd ON sd.session_id = sh.session_id
    JOIN app.dossiers dd ON dd.id = sd.dossier_id AND dd.deleted_at IS NULL
    WHERE sig.participant_kind = 'learner'
      AND (sig.late_arrival_time IS NOT NULL OR sig.status = 'late'
           OR sig.evidence_source IN ('zoom_csv', 'zoom_api'))
  LOOP
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
END $$;
