-- 0148 — Émargement en salle : QR code dynamique projeté (modèle Edusign)
--
-- Le formateur projette un QR code qui change toutes les dix secondes ;
-- l'apprenant le scanne avec son téléphone, s'identifie (une fois, par son
-- e-mail) et signe. Le code tournant empêche d'émarger depuis chez soi avec
-- une photo transmise ; un téléphone ne sert qu'à une personne par feuille.
--
--  · Nouveau canal de lien « salle », rattaché à l'appareil qui a scanné.
--  · La signature faite par ce canal est enregistrée en mode « qr » (la base
--    en décide, pas le navigateur).
--
-- Rejouable sans risque.

-- ── Canal « salle » et appareil ────────────────────────────────────────────
ALTER TABLE app.attendance_token_jtis ADD COLUMN IF NOT EXISTS device_id UUID;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'app.attendance_token_jtis'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%issued_channel%'
  LOOP
    EXECUTE format('ALTER TABLE app.attendance_token_jtis DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE app.attendance_token_jtis
  ADD CONSTRAINT attendance_token_jtis_issued_channel_check
  CHECK (issued_channel IS NULL OR issued_channel IN ('email', 'espace', 'equipe', 'salle'));
ALTER TABLE app.attendance_token_jtis
  ADD CONSTRAINT attendance_token_jtis_salle_device_check
  CHECK (issued_channel IS DISTINCT FROM 'salle' OR device_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS attendance_token_jtis_sheet_device_idx
  ON app.attendance_token_jtis (attendance_sheet_id, device_id)
  WHERE device_id IS NOT NULL;

-- ── Signature : canal « salle » → mode « qr » ──────────────────────────────
CREATE OR REPLACE FUNCTION app.record_attendance_step(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_moment TEXT,
  p_image_path TEXT,
  p_signature_hash TEXT,
  p_signer_ip INET,
  p_signer_user_agent TEXT,
  p_signer_country CHAR(2),
  p_token_jti UUID,
  p_capture_mode TEXT,
  p_actor UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_sheet    RECORD;
  v_modality TEXT;
  v_win      RECORD;
  v_row      app.attendance_signatures;
  v_found    BOOLEAN;
  v_id       UUID;
  v_now      TIMESTAMPTZ := now();
  v_local    TIME := date_trunc('minute', now() AT TIME ZONE 'Europe/Paris')::time;
  v_status   app.attendance_status := 'present';
  v_late     TIME;
  v_early    TIME;
  v_channel  TEXT;
  v_issued   UUID;
  v_mode     TEXT;
  v_actor    UUID := p_actor;
BEGIN
  IF p_signer_kind NOT IN ('learner', 'trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;
  IF p_moment NOT IN ('entry', 'exit') THEN
    RAISE EXCEPTION 'invalid_moment' USING ERRCODE = 'P0001';
  END IF;
  IF p_capture_mode NOT IN ('lien', 'qr', 'tablette', 'visio') THEN
    RAISE EXCEPTION 'invalid_capture_mode' USING ERRCODE = 'P0001';
  END IF;

  SELECT sh.id, sh.organization_id, sh.session_id, sh.status
    INTO v_sheet
    FROM app.attendance_sheets sh
   WHERE sh.id = p_attendance_sheet_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sheet.status IN ('finalized', 'completed') THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.session_expected_signers(v_sheet.session_id) e
    WHERE e.participant_kind = p_signer_kind AND e.participant_id = p_signer_id
  ) THEN
    RAISE EXCEPTION 'signer_not_expected' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.modality::text INTO v_modality FROM app.sessions s WHERE s.id = v_sheet.session_id;
  -- Confirmation sans tracé : uniquement pour une séance entièrement à distance.
  IF p_image_path IS NULL AND NOT (p_capture_mode = 'visio' AND v_modality = 'distanciel') THEN
    RAISE EXCEPTION 'signature_required' USING ERRCODE = 'P0001';
  END IF;

  -- Entrée : d'une heure avant le début à la fin de la demi-journée.
  -- Sortie : du début à deux heures après la fin.
  SELECT * INTO v_win FROM app.attendance_sheet_window(p_attendance_sheet_id);
  IF (p_moment = 'entry' AND (v_now < v_win.window_start - interval '60 minutes' OR v_now > v_win.window_end))
     OR (p_moment = 'exit' AND (v_now < v_win.window_start OR v_now > v_win.window_end + interval '120 minutes')) THEN
    RAISE EXCEPTION 'outside_signing_window' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
    FROM app.attendance_signatures
   WHERE attendance_sheet_id = p_attendance_sheet_id
     AND participant_kind = p_signer_kind
     AND participant_id = p_signer_id
   FOR UPDATE;
  v_found := FOUND;

  -- Lien remis par l'équipe (copié, QR imprimé) : la signature est rattachée à
  -- la personne qui l'a émis — elle n'est pas présentée comme un envoi personnel.
  v_mode := p_capture_mode;
  IF p_token_jti IS NOT NULL THEN
    SELECT issued_channel, issued_by INTO v_channel, v_issued
      FROM app.attendance_token_jtis WHERE jti = p_token_jti;
    IF v_channel = 'equipe' THEN
      v_mode := 'lien_equipe';
      v_actor := COALESCE(v_actor, v_issued);
    ELSIF v_channel = 'salle' THEN
      -- QR dynamique projeté en salle : la personne a signé sur son téléphone.
      v_mode := 'qr';
    END IF;
  END IF;

  IF p_moment = 'entry' THEN
    -- Une signature ne s'écrase jamais ; une présence attestée par l'équipe,
    -- elle, cède la place à la signature de la personne.
    IF v_found AND app.attendance_self_signed(v_row.capture_mode, v_row.evidence_source, v_row.signed_at) THEN
      RAISE EXCEPTION 'already_signed_entry' USING ERRCODE = 'P0001';
    END IF;
    IF p_token_jti IS NOT NULL THEN
      PERFORM app.consume_attendance_token_step(
        p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, 'entry', p_signer_ip);
    END IF;

    IF p_signer_kind = 'learner' AND v_now > v_win.window_start + interval '15 minutes' THEN
      v_status := 'late';
      v_late := v_local;
    END IF;
    -- Un retard déjà constaté par l'équipe reste un retard.
    IF v_late IS NULL AND v_found AND v_row.late_arrival_time IS NOT NULL THEN
      v_status := 'late';
    END IF;

    INSERT INTO app.attendance_signatures (
      organization_id, attendance_sheet_id, participant_kind, learner_id, trainer_id,
      status, signature_image_path, signed_at,
      signer_ip, signer_user_agent, signer_country, signature_hash, token_id,
      evidence_source, capture_mode, late_arrival_time, absence_reason, marked_by
    ) VALUES (
      v_sheet.organization_id, p_attendance_sheet_id, p_signer_kind,
      CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
      CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
      v_status, p_image_path, v_now,
      p_signer_ip, p_signer_user_agent, p_signer_country, p_signature_hash, p_token_jti,
      CASE WHEN p_capture_mode = 'tablette' THEN 'manual' ELSE 'qr' END,
      v_mode, v_late, NULL, v_actor
    )
    ON CONFLICT (attendance_sheet_id, participant_kind, participant_id) DO UPDATE SET
      status               = EXCLUDED.status,
      signature_image_path = EXCLUDED.signature_image_path,
      signed_at            = EXCLUDED.signed_at,
      signer_ip            = EXCLUDED.signer_ip,
      signer_user_agent    = EXCLUDED.signer_user_agent,
      signer_country       = EXCLUDED.signer_country,
      signature_hash       = EXCLUDED.signature_hash,
      token_id             = EXCLUDED.token_id,
      evidence_source      = EXCLUDED.evidence_source,
      capture_mode         = EXCLUDED.capture_mode,
      late_arrival_time    = COALESCE(EXCLUDED.late_arrival_time, app.attendance_signatures.late_arrival_time),
      absence_reason       = NULL,
      marked_by            = EXCLUDED.marked_by
    RETURNING id INTO v_id;
  ELSE
    IF NOT v_found OR v_row.signed_at IS NULL OR v_row.status IN ('absent', 'absent_justified') THEN
      RAISE EXCEPTION 'entry_required' USING ERRCODE = 'P0001';
    END IF;
    IF v_row.exit_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'already_signed_exit' USING ERRCODE = 'P0001';
    END IF;
    IF p_token_jti IS NOT NULL THEN
      PERFORM app.consume_attendance_token_step(
        p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, 'exit', p_signer_ip);
    END IF;

    IF p_signer_kind = 'learner' AND v_now < v_win.window_end - interval '15 minutes' THEN
      v_early := v_local;
    END IF;

    UPDATE app.attendance_signatures
       SET exit_signed_at         = v_now,
           exit_image_path        = p_image_path,
           exit_signer_ip         = p_signer_ip,
           exit_signer_user_agent = p_signer_user_agent,
           exit_signature_hash    = p_signature_hash,
           early_departure_time   = COALESCE(v_early, early_departure_time)
     WHERE id = v_row.id
    RETURNING id, status INTO v_id, v_status;
  END IF;

  INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
  VALUES (
    v_sheet.organization_id, 'attendance_sheet', p_attendance_sheet_id, 'attendance.signature_recorded',
    jsonb_build_object(
      'signature_id', v_id, 'moment', p_moment, 'signer_kind', p_signer_kind,
      'signer_id', p_signer_id, 'capture_mode', v_mode)
  );

  RETURN jsonb_build_object(
    'signature_id', v_id,
    'moment', p_moment,
    'signed_at', v_now,
    'status', v_status,
    'late_arrival_time', v_late,
    'early_departure_time', v_early,
    'channel', v_channel
  );
END $$;

REVOKE ALL ON FUNCTION app.record_attendance_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.record_attendance_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
