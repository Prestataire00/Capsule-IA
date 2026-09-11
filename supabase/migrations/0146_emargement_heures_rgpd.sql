-- 0146 — Émargement : heures réellement suivies, recalcul immédiat, RGPD
--
-- Constats (audit émargement, 2026-09-11) :
--  · Les heures « suivies » créditaient la séance ENTIÈRE dès qu'une demi-
--    journée portait une présence (`bool_or`) : une après-midi manquée n'était
--    jamais déduite, retards et départs anticipés non plus.
--  · Ce recalcul passait par un événement traité par une tâche qui ne tourne
--    pas (le répartiteur est programmé via GitHub, bloqué) : les heures et le
--    taux d'assiduité des attestations restaient figés.
--  · La purge des IP à 5 ans et l'anonymisation d'un apprenant modifient ses
--    signatures ; sur une feuille clôturée, le verrou d'immutabilité les
--    refusait — et la purge, en une seule instruction, échouait en entier.
--    Les colonnes de sortie (0145) n'étaient pas couvertes.
--  · La table de suivi des heures était modifiable par tout membre connecté.
--
-- Rejouable.

-- ── 1. Heures suivies, demi-journée par demi-journée ────────────────────────
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

  -- Chaque feuille (matin, après-midi) vaut sa propre fenêtre ; une présence
  -- en retard ou partie avant la fin ne compte que le temps effectivement suivi.
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
                COALESCE((f.jour + f.early_departure_time) AT TIME ZONE 'Europe/Paris', f.window_end))
          - GREATEST(f.window_start,
                COALESCE((f.jour + f.late_arrival_time) AT TIME ZONE 'Europe/Paris', f.window_start))
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

-- ── 2. Recalcul immédiat à chaque signature ou marquage ─────────────────────
CREATE OR REPLACE FUNCTION app.tg_attendance_recompute_hours()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE
  v_session UUID;
  d RECORD;
BEGIN
  IF NEW.participant_kind <> 'learner' OR NEW.learner_id IS NULL THEN RETURN NEW; END IF;
  SELECT sh.session_id INTO v_session FROM app.attendance_sheets sh WHERE sh.id = NEW.attendance_sheet_id;
  IF v_session IS NULL THEN RETURN NEW; END IF;

  FOR d IN
    SELECT dd.id FROM app.dossiers dd
    WHERE dd.learner_id = NEW.learner_id
      AND dd.id IN (SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = v_session)
  LOOP
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION app.tg_attendance_recompute_hours() FROM PUBLIC;

DROP TRIGGER IF EXISTS tg_attendance_sig_hours_dirty ON app.attendance_signatures;
CREATE TRIGGER tg_attendance_sig_hours_dirty
  AFTER INSERT OR UPDATE OF status, late_arrival_time, early_departure_time ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_recompute_hours();

-- ── 3. RGPD : effacer les données techniques reste permis après clôture ─────
CREATE OR REPLACE FUNCTION app.tg_attendance_signature_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sheet_status TEXT;
  -- Données effaçables, plus `participant_id` : colonne générée, encore NULL
  -- dans NEW au moment d'un déclencheur BEFORE — elle fausserait la comparaison.
  v_pii CONSTANT TEXT[] := ARRAY['signer_ip', 'signer_user_agent', 'signer_country',
                                 'exit_signer_ip', 'exit_signer_user_agent', 'notes', 'participant_id'];
BEGIN
  SELECT status INTO v_sheet_status
    FROM app.attendance_sheets
   WHERE id = COALESCE(NEW.attendance_sheet_id, OLD.attendance_sheet_id);

  IF v_sheet_status = 'finalized' THEN
    -- Seul effacement admis : IP, navigateur, pays, notes, passés à NULL
    -- (purge à 5 ans, anonymisation). La preuve elle-même ne bouge pas.
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - v_pii) = (to_jsonb(OLD) - v_pii)
       AND (NEW.signer_ip IS NULL OR NEW.signer_ip IS NOT DISTINCT FROM OLD.signer_ip)
       AND (NEW.signer_user_agent IS NULL OR NEW.signer_user_agent IS NOT DISTINCT FROM OLD.signer_user_agent)
       AND (NEW.signer_country IS NULL OR NEW.signer_country IS NOT DISTINCT FROM OLD.signer_country)
       AND (NEW.exit_signer_ip IS NULL OR NEW.exit_signer_ip IS NOT DISTINCT FROM OLD.exit_signer_ip)
       AND (NEW.exit_signer_user_agent IS NULL OR NEW.exit_signer_user_agent IS NOT DISTINCT FROM OLD.exit_signer_user_agent)
       AND (NEW.notes IS NULL OR NEW.notes IS NOT DISTINCT FROM OLD.notes) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = 'attendance_signature_parent_finalized : feuille clôturée, modification interdite';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- Le verrou des feuilles (0033) combinait un texte et l'option MESSAGE dans
-- ses RAISE, ce que PostgreSQL refuse à l'exécution : la modification était
-- bien bloquée, mais par une erreur de syntaxe au lieu du code P0010.
CREATE OR REPLACE FUNCTION app.tg_attendance_sheet_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = format('attendance_sheet_finalized : feuille %s clôturée, suppression interdite', OLD.id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Seul le rattachement initial du PDF (document_id NULL → non NULL) est admis.
    IF OLD.document_id IS NULL AND NEW.document_id IS NOT NULL
       AND OLD.status = NEW.status
       AND OLD.finalized_at IS NOT DISTINCT FROM NEW.finalized_at
       AND OLD.finalized_by IS NOT DISTINCT FROM NEW.finalized_by THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0010',
      MESSAGE = format('attendance_sheet_finalized : feuille %s clôturée, modification interdite', OLD.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

-- Effacer les données techniques de l'entrée efface aussi celles de la sortie
-- (l'anonymisation 0087 ne connaît pas les colonnes de sortie).
CREATE OR REPLACE FUNCTION app.tg_attendance_signature_pii_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.signer_ip IS NOT NULL AND NEW.signer_ip IS NULL)
     OR (OLD.signer_user_agent IS NOT NULL AND NEW.signer_user_agent IS NULL) THEN
    NEW.exit_signer_ip := NULL;
    NEW.exit_signer_user_agent := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_attendance_signature_pii_sync ON app.attendance_signatures;
CREATE TRIGGER tg_attendance_signature_pii_sync
  BEFORE UPDATE OF signer_ip, signer_user_agent ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_signature_pii_sync();

-- Purge à 5 ans : colonnes de sortie comprises.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'attendance_purge_ip_yearly',
      '0 4 1 * *',
      $cron$
        UPDATE app.attendance_signatures
           SET signer_ip = NULL, signer_user_agent = NULL, signer_country = NULL,
               exit_signer_ip = NULL, exit_signer_user_agent = NULL
         WHERE signed_at < now() - interval '5 years'
           AND (signer_ip IS NOT NULL OR signer_user_agent IS NOT NULL OR signer_country IS NOT NULL
                OR exit_signer_ip IS NOT NULL OR exit_signer_user_agent IS NOT NULL);
      $cron$
    );
  END IF;
END $do$;

-- ── 4. Suivi des heures : lecture seule pour les membres ────────────────────
-- Les écritures passent par `recompute_dossier_hours` (SECURITY DEFINER) et le
-- service role ; un membre ne doit pas pouvoir y inscrire d'heures.
DROP POLICY IF EXISTS dossier_hours_tracking_rw ON app.dossier_hours_tracking;
DROP POLICY IF EXISTS dossier_hours_tracking_select ON app.dossier_hours_tracking;
CREATE POLICY dossier_hours_tracking_select ON app.dossier_hours_tracking
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- ── 5. Heures recalculées pour tous les dossiers ────────────────────────────
DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM app.dossiers WHERE deleted_at IS NULL LOOP
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
END $$;
