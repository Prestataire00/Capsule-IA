-- 0145 — Émargement : réparation de la signature, entrée + sortie, statuts
--
-- Constat (audit émargement, 2026-09-11) : aucune signature ne pouvait aboutir.
--  · Les jetons de signature n'étaient jamais enregistrés dans
--    `attendance_token_jtis` : la consommation refusait tout lien (« token_unknown »).
--  · `record_attendance_signature` écrivait son événement avec une colonne
--    `kind` inexistante et sans `aggregate_type` : l'insertion échouait, et
--    avec elle la signature (et l'import Zoom CSV).
--  · Une nouvelle signature écrasait la précédente ; le signataire n'était
--    jamais comparé aux participants attendus ; aucune fenêtre horaire.
--  · Les feuilles de session de groupe (sans dossier) étaient introuvables
--    depuis la page de signature (jointure interne sur le dossier).
--
-- Nouveau modèle, repris de SoSafe (lui-même inspiré de Digiforma) :
--  · chaque demi-journée se signe à l'ENTRÉE puis à la SORTIE, avec le même
--    lien personnel ; la sortie est refusée avant l'entrée ;
--  · retard et départ anticipé sont constatés à partir de l'heure de signature
--    (au-delà de 15 minutes), et ajustables par l'équipe ;
--  · l'équipe peut marquer un absent, un absent excusé (motif obligatoire), un
--    retard ou un départ anticipé depuis une grille ;
--  · une signature se dessine, sauf la confirmation de présence en visio.
--
-- Rejouable.

-- ── 1. Colonnes ─────────────────────────────────────────────────────────────
ALTER TABLE app.attendance_signatures
  ADD COLUMN IF NOT EXISTS exit_signed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_image_path        TEXT,
  ADD COLUMN IF NOT EXISTS exit_signer_ip         INET,
  ADD COLUMN IF NOT EXISTS exit_signer_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS exit_signature_hash    TEXT,
  ADD COLUMN IF NOT EXISTS late_arrival_time      TIME,
  ADD COLUMN IF NOT EXISTS early_departure_time   TIME,
  ADD COLUMN IF NOT EXISTS absence_reason         TEXT
    CHECK (absence_reason IS NULL OR length(absence_reason) <= 1000),
  -- Comment la présence a été recueillie : lien personnel, QR imprimé,
  -- tablette de l'organisme, confirmation visio, grille de l'équipe, Zoom.
  ADD COLUMN IF NOT EXISTS capture_mode           TEXT
    CHECK (capture_mode IS NULL OR capture_mode IN ('lien', 'qr', 'tablette', 'visio', 'grille', 'zoom')),
  ADD COLUMN IF NOT EXISTS marked_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Un même lien sert à l'entrée puis à la sortie.
ALTER TABLE app.attendance_token_jtis
  ADD COLUMN IF NOT EXISTS entry_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_consumed_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_token_jtis_reuse
  ON app.attendance_token_jtis (attendance_sheet_id, signer_kind, signer_id)
  WHERE status = 'issued';

-- Envoi automatique des liens avant chaque demi-journée : désactivé par défaut.
ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS attendance_auto_send BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Fenêtre horaire d'une feuille ────────────────────────────────────────
-- Même règle que la création des feuilles (0082) : frontière à 13:00, Paris.
CREATE OR REPLACE FUNCTION app.attendance_sheet_window(
  p_sheet_id UUID,
  OUT window_start TIMESTAMPTZ,
  OUT window_end TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    CASE WHEN sh.half_day = 'afternoon' THEN GREATEST(s.starts_at, b.midi) ELSE s.starts_at END,
    CASE WHEN sh.half_day = 'morning'   THEN LEAST(s.ends_at, b.midi)      ELSE s.ends_at   END
  FROM app.attendance_sheets sh
  JOIN app.sessions s ON s.id = sh.session_id
  CROSS JOIN LATERAL (
    SELECT (((s.starts_at AT TIME ZONE 'Europe/Paris')::date + TIME '13:00')
            AT TIME ZONE 'Europe/Paris') AS midi
  ) b
  WHERE sh.id = p_sheet_id
$$;

-- ── 3. Signataires attendus d'une session ───────────────────────────────────
-- Apprenants : participants inscrits, et apprenants des dossiers de la session
-- (la matérialisation des participants passe par une tâche qui peut ne pas
-- avoir tourné), moins ceux retirés à la main. Formateurs : participants
-- inscrits et formateurs affectés aux dossiers de la session.
CREATE OR REPLACE FUNCTION app.session_expected_signers(p_session_id UUID)
RETURNS TABLE (participant_kind TEXT, participant_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH dossiers_session AS (
    SELECT s.dossier_id AS id FROM app.sessions s WHERE s.id = p_session_id AND s.dossier_id IS NOT NULL
    UNION
    SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = p_session_id
  ),
  retires AS (
    SELECT sp.participant_kind, sp.participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.source = 'manual_remove'
  ),
  candidats AS (
    SELECT 'learner'::text AS participant_kind, sp.learner_id AS participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'learner' AND sp.source <> 'manual_remove'
    UNION
    SELECT 'learner', d.learner_id
    FROM app.dossiers d
    JOIN app.sessions s ON s.id = p_session_id
    WHERE d.id = s.dossier_id AND d.deleted_at IS NULL
    UNION
    SELECT 'learner', a.learner_id FROM app.derive_session_attendees(p_session_id) a
    UNION
    SELECT 'trainer', sp.trainer_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'trainer' AND sp.source <> 'manual_remove'
    UNION
    SELECT 'trainer', dt.trainer_id
    FROM app.dossier_trainers dt
    WHERE dt.dossier_id IN (SELECT id FROM dossiers_session)
  )
  SELECT c.participant_kind, c.participant_id
  FROM candidats c
  WHERE c.participant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM retires r
      WHERE r.participant_kind = c.participant_kind AND r.participant_id = c.participant_id)
$$;

-- Une présence est-elle signée par la personne elle-même (et non attestée) ?
CREATE OR REPLACE FUNCTION app.attendance_self_signed(
  p_capture_mode TEXT, p_evidence_source TEXT, p_signed_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_signed_at IS NOT NULL AND (
    p_capture_mode IN ('lien', 'qr', 'tablette', 'visio')
    OR (p_capture_mode IS NULL AND p_evidence_source IN ('qr', 'manual')))
$$;

-- ── 4. Consommation d'un lien, étape par étape ──────────────────────────────
CREATE OR REPLACE FUNCTION app.consume_attendance_token_step(
  p_jti UUID,
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_moment TEXT,
  p_ip INET
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row app.attendance_token_jtis;
BEGIN
  SELECT * INTO v_row FROM app.attendance_token_jtis WHERE jti = p_jti FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_unknown' USING ERRCODE = 'P0003';
  END IF;
  IF v_row.status <> 'issued' THEN
    RAISE EXCEPTION 'token_%', v_row.status USING ERRCODE = 'P0003';
  END IF;
  IF v_row.expires_at < now() THEN
    UPDATE app.attendance_token_jtis SET status = 'expired' WHERE jti = p_jti;
    RAISE EXCEPTION 'token_expired' USING ERRCODE = 'P0003';
  END IF;
  IF v_row.attendance_sheet_id <> p_attendance_sheet_id
     OR v_row.signer_id <> p_signer_id
     OR v_row.signer_kind <> p_signer_kind THEN
    RAISE EXCEPTION 'token_payload_mismatch' USING ERRCODE = 'P0003';
  END IF;

  IF p_moment = 'entry' THEN
    IF v_row.entry_consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'token_entry_used' USING ERRCODE = 'P0003';
    END IF;
    UPDATE app.attendance_token_jtis
       SET entry_consumed_at = now(), consumed_ip = p_ip
     WHERE jti = p_jti;
  ELSE
    IF v_row.exit_consumed_at IS NOT NULL THEN
      RAISE EXCEPTION 'token_exit_used' USING ERRCODE = 'P0003';
    END IF;
    UPDATE app.attendance_token_jtis
       SET exit_consumed_at = now(), consumed_at = now(), status = 'consumed', consumed_ip = p_ip
     WHERE jti = p_jti;
  END IF;
END $$;

-- ── 5. Signature d'une étape (entrée ou sortie) ─────────────────────────────
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
  IF v_sheet.status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM app.session_expected_signers(v_sheet.session_id) e
    WHERE e.participant_kind = p_signer_kind AND e.participant_id = p_signer_id
  ) THEN
    RAISE EXCEPTION 'signer_not_expected' USING ERRCODE = 'P0001';
  END IF;

  SELECT s.modality::text INTO v_modality FROM app.sessions s WHERE s.id = v_sheet.session_id;
  IF p_image_path IS NULL AND NOT (p_capture_mode = 'visio' AND v_modality IN ('distanciel', 'hybride')) THEN
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
      p_capture_mode, v_late, NULL, p_actor
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
      'signer_id', p_signer_id, 'capture_mode', p_capture_mode)
  );

  RETURN jsonb_build_object(
    'signature_id', v_id,
    'moment', p_moment,
    'signed_at', v_now,
    'status', v_status,
    'late_arrival_time', v_late,
    'early_departure_time', v_early
  );
END $$;

-- ── 6. Marquage par l'équipe (grille, visio) ────────────────────────────────
CREATE OR REPLACE FUNCTION app.set_attendance_mark(
  p_attendance_sheet_id UUID,
  p_learner_id UUID,
  p_status app.attendance_status,
  p_late_arrival TIME,
  p_early_departure TIME,
  p_reason TEXT,
  p_capture_mode TEXT,
  p_actor UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_sheet RECORD;
  v_id    UUID;
  v_now   TIMESTAMPTZ := now();
  v_here  BOOLEAN := p_status IN ('present', 'late', 'remote');
BEGIN
  IF p_capture_mode NOT IN ('grille', 'visio') THEN
    RAISE EXCEPTION 'invalid_capture_mode' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_here AND (p_late_arrival IS NOT NULL OR p_early_departure IS NOT NULL) THEN
    RAISE EXCEPTION 'incoherent_mark' USING ERRCODE = 'P0001';
  END IF;
  IF p_status = 'absent_justified' AND btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT sh.id, sh.organization_id, sh.session_id, sh.status
    INTO v_sheet
    FROM app.attendance_sheets sh
   WHERE sh.id = p_attendance_sheet_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sheet.status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.session_expected_signers(v_sheet.session_id) e
    WHERE e.participant_kind = 'learner' AND e.participant_id = p_learner_id
  ) THEN
    RAISE EXCEPTION 'signer_not_expected' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind, learner_id,
    status, signed_at, evidence_source, capture_mode,
    late_arrival_time, early_departure_time, absence_reason, marked_by
  ) VALUES (
    v_sheet.organization_id, p_attendance_sheet_id, 'learner', p_learner_id,
    p_status, CASE WHEN v_here THEN v_now END, 'trainer_override', p_capture_mode,
    p_late_arrival, p_early_departure, NULLIF(btrim(COALESCE(p_reason, '')), ''), p_actor
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id) DO UPDATE SET
    status = EXCLUDED.status,
    -- Une signature déjà posée est conservée : l'équipe corrige le statut,
    -- elle n'efface pas la preuve (le journal d'audit garde l'avant/après).
    signed_at = CASE
      WHEN app.attendance_self_signed(app.attendance_signatures.capture_mode,
                                      app.attendance_signatures.evidence_source,
                                      app.attendance_signatures.signed_at)
        THEN app.attendance_signatures.signed_at
      WHEN EXCLUDED.status IN ('present', 'late', 'remote')
        THEN COALESCE(app.attendance_signatures.signed_at, EXCLUDED.signed_at)
      ELSE NULL END,
    evidence_source = CASE
      WHEN app.attendance_self_signed(app.attendance_signatures.capture_mode,
                                      app.attendance_signatures.evidence_source,
                                      app.attendance_signatures.signed_at)
        THEN app.attendance_signatures.evidence_source
      ELSE 'trainer_override' END,
    capture_mode = CASE
      WHEN app.attendance_self_signed(app.attendance_signatures.capture_mode,
                                      app.attendance_signatures.evidence_source,
                                      app.attendance_signatures.signed_at)
        THEN app.attendance_signatures.capture_mode
      ELSE EXCLUDED.capture_mode END,
    late_arrival_time    = EXCLUDED.late_arrival_time,
    early_departure_time = EXCLUDED.early_departure_time,
    absence_reason       = EXCLUDED.absence_reason,
    marked_by            = EXCLUDED.marked_by
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ── 7. Ancienne RPC : événement réparé (utilisée par d'anciens chemins) ─────
CREATE OR REPLACE FUNCTION app.record_attendance_signature(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_image_path TEXT,
  p_signature_hash TEXT,
  p_signer_ip INET,
  p_signer_user_agent TEXT,
  p_signer_country CHAR(2),
  p_token_jti UUID,
  p_evidence_source TEXT,
  p_evidence_payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org_id UUID;
  v_signature_id UUID;
BEGIN
  IF p_signer_kind NOT IN ('learner','trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;
  IF p_evidence_source NOT IN ('manual','qr','zoom_csv','zoom_api','trainer_override') THEN
    RAISE EXCEPTION 'invalid_evidence_source' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id INTO v_org_id
    FROM app.attendance_sheets
   WHERE id = p_attendance_sheet_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_token_jti IS NOT NULL THEN
    PERFORM app.consume_attendance_token(
      p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, p_signer_ip
    );
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind,
    learner_id, trainer_id,
    status, signature_image_path, signed_at,
    signer_ip, signer_user_agent, signer_country,
    signature_hash, token_id,
    evidence_source, evidence_payload
  ) VALUES (
    v_org_id, p_attendance_sheet_id, p_signer_kind,
    CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
    CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
    'present', p_image_path, now(),
    p_signer_ip, p_signer_user_agent, p_signer_country,
    p_signature_hash, p_token_jti,
    p_evidence_source, p_evidence_payload
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id)
  DO UPDATE SET
    status = 'present',
    signature_image_path = EXCLUDED.signature_image_path,
    signed_at = EXCLUDED.signed_at,
    signer_ip = EXCLUDED.signer_ip,
    signer_user_agent = EXCLUDED.signer_user_agent,
    signer_country = EXCLUDED.signer_country,
    signature_hash = EXCLUDED.signature_hash,
    token_id = EXCLUDED.token_id,
    evidence_source = EXCLUDED.evidence_source,
    evidence_payload = EXCLUDED.evidence_payload
  RETURNING id INTO v_signature_id;

  INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
  VALUES (
    v_org_id, 'attendance_sheet', p_attendance_sheet_id, 'attendance.signature_recorded',
    jsonb_build_object(
      'signature_id', v_signature_id,
      'signer_kind', p_signer_kind,
      'signer_id', p_signer_id,
      'evidence_source', p_evidence_source
    )
  );

  RETURN v_signature_id;
END;
$$;

-- ── 8. Contexte de la page de signature ─────────────────────────────────────
-- Feuilles de groupe comprises (sans dossier) : la formation vient de la
-- session, et l'on retrouve le dossier de l'apprenant pour son espace.
DROP FUNCTION IF EXISTS app.get_signature_context(UUID, UUID, TEXT);
CREATE FUNCTION app.get_signature_context(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT
)
RETURNS TABLE (
  attendance_sheet_id UUID,
  signer_id UUID,
  signer_kind TEXT,
  signer_full_name TEXT,
  learner_dossier_id UUID,
  dossier_reference TEXT,
  formation_title TEXT,
  session_id UUID,
  session_title TEXT,
  session_starts_at TIMESTAMPTZ,
  session_ends_at TIMESTAMPTZ,
  session_modality TEXT,
  half_day TEXT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  organization_id UUID,
  organization_name TEXT,
  sheet_finalized BOOLEAN,
  expected BOOLEAN,
  entry_signed_at TIMESTAMPTZ,
  exit_signed_at TIMESTAMPTZ,
  attendance_status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH ctx AS (
    SELECT sh.*, s.title AS s_title, s.starts_at, s.ends_at, s.modality::text AS modality,
           s.formation_id AS s_formation_id, s.dossier_id AS s_dossier_id
    FROM app.attendance_sheets sh
    JOIN app.sessions s ON s.id = sh.session_id
    WHERE sh.id = p_attendance_sheet_id
  ),
  dossier_apprenant AS (
    SELECT d.id, d.reference, d.formation_id
    FROM app.dossiers d, ctx
    WHERE p_signer_kind = 'learner'
      AND d.learner_id = p_signer_id
      AND d.deleted_at IS NULL
      AND (d.id = ctx.s_dossier_id
           OR d.id IN (SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = ctx.session_id))
    LIMIT 1
  )
  SELECT
    ctx.id,
    p_signer_id,
    p_signer_kind,
    CASE p_signer_kind
      WHEN 'learner' THEN (SELECT l.first_name || ' ' || l.last_name FROM app.learners l WHERE l.id = p_signer_id)
      WHEN 'trainer' THEN (SELECT t.first_name || ' ' || t.last_name FROM app.trainers t WHERE t.id = p_signer_id)
    END,
    (SELECT id FROM dossier_apprenant),
    COALESCE((SELECT reference FROM dossier_apprenant),
             (SELECT d.reference FROM app.dossiers d WHERE d.id = ctx.dossier_id)),
    (SELECT f.title FROM app.formations f
      WHERE f.id = COALESCE(ctx.s_formation_id,
                            (SELECT formation_id FROM dossier_apprenant),
                            (SELECT d.formation_id FROM app.dossiers d WHERE d.id = ctx.dossier_id))),
    ctx.session_id,
    ctx.s_title,
    ctx.starts_at,
    ctx.ends_at,
    ctx.modality,
    ctx.half_day,
    w.window_start,
    w.window_end,
    o.id,
    o.name,
    ctx.status = 'finalized',
    EXISTS (SELECT 1 FROM app.session_expected_signers(ctx.session_id) e
            WHERE e.participant_kind = p_signer_kind AND e.participant_id = p_signer_id),
    CASE WHEN app.attendance_self_signed(sig.capture_mode, sig.evidence_source, sig.signed_at)
         THEN sig.signed_at END,
    sig.exit_signed_at,
    sig.status::text
  FROM ctx
  JOIN app.organizations o ON o.id = ctx.organization_id
  CROSS JOIN LATERAL app.attendance_sheet_window(ctx.id) w
  LEFT JOIN app.attendance_signatures sig
    ON sig.attendance_sheet_id = ctx.id
   AND sig.participant_kind = p_signer_kind
   AND sig.participant_id = p_signer_id
$$;

-- ── 9. Droits : service role uniquement ─────────────────────────────────────
REVOKE ALL ON FUNCTION app.attendance_sheet_window(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.session_expected_signers(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.consume_attendance_token_step(UUID, UUID, UUID, TEXT, TEXT, INET) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_attendance_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.set_attendance_mark(UUID, UUID, app.attendance_status, TIME, TIME, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.attendance_sheet_window(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.session_expected_signers(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.consume_attendance_token_step(UUID, UUID, UUID, TEXT, TEXT, INET) TO service_role;
GRANT EXECUTE ON FUNCTION app.record_attendance_step(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.set_attendance_mark(UUID, UUID, app.attendance_status, TIME, TIME, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
