-- 0147 — Émargement : correctifs de l'audit (sécurité, exactitude, conformité)
--
-- Audit en trois volets de l'émargement refondu (0145, 0146), 2026-09-11.
--
-- Sécurité
--  · Chaque lien de signature porte son canal d'émission (e-mail, espace
--    apprenant, équipe) et son émetteur : un lien remis par l'équipe (copié,
--    QR imprimé) n'est plus présenté comme une signature personnelle, et il
--    ne donne pas accès à l'espace apprenant.
--  · `materialize_attendance_slots` (0082) était exécutable par tout le monde,
--    y compris sans connexion : réservée au service role. Les fonctions
--    d'émargement sont explicitement retirées à anon et authenticated.
--  · Le verrou d'une feuille couvre aussi les INSERTIONS (l'import Zoom
--    écrivait dans une feuille clôturée) et l'état « clôture en cours ».
--
-- Exactitude
--  · Pause déjeuner réglable par organisme (12:30–13:30 par défaut) : la
--    coupure fixe à 13:00 notait chaque jour un départ anticipé et un retard.
--    La durée d'une séance, pour les heures, exclut désormais la pause.
--  · Une replanification retire les demi-journées devenues sans objet (si
--    elles sont vierges) au lieu de laisser une feuille fantôme.
--  · Séance sur plusieurs jours ou passant minuit : une feuille unique.
--  · Formateurs marquables par l'équipe (un formateur qui avait oublié de
--    signer bloquait la clôture pour toujours) ; sortie attestée par l'équipe
--    quand un apprenant a oublié de signer la sienne.
--  · Dossiers supprimés ou abandonnés : leurs apprenants ne sont plus attendus.
--  · Un retard constaté par l'équipe reste un retard quand l'apprenant signe.
--  · Confirmation de présence sans tracé : séances entièrement à distance
--    seulement (en hybride, une personne en salle échappait à la signature).
--  · Qualiopi : l'indicateur « émargements finalisés » compte les feuilles des
--    sessions de groupe, et se recalcule à chaque changement de feuille.
--  · Heures : recalculées aussi à la clôture et chaque nuit (une séance ne
--    compte qu'une fois terminée) ; présences Zoom au prorata de la connexion.
--
-- Opérations
--  · Les tâches programmées étaient confiées à GitHub Actions, bloqué : elles
--    sont désormais lancées par la base (pg_cron + pg_net). Il suffit
--    d'enregistrer le secret dans le coffre Supabase :
--      select vault.create_secret('<valeur de CRON_SECRET>', 'cron_secret');
--
-- Rejouable.

-- ── 1. Colonnes ─────────────────────────────────────────────────────────────
ALTER TABLE app.attendance_token_jtis
  ADD COLUMN IF NOT EXISTS issued_channel TEXT
    CHECK (issued_channel IS NULL OR issued_channel IN ('email', 'espace', 'equipe')),
  ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS attendance_lunch_start TIME NOT NULL DEFAULT '12:30',
  ADD COLUMN IF NOT EXISTS attendance_lunch_end   TIME NOT NULL DEFAULT '13:30';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_attendance_lunch_check') THEN
    ALTER TABLE app.organizations
      ADD CONSTRAINT organizations_attendance_lunch_check CHECK (attendance_lunch_end > attendance_lunch_start);
  END IF;
END $$;

ALTER TABLE app.attendance_signatures
  ADD COLUMN IF NOT EXISTS exit_attested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Modes de recueil : lien remis par l'équipe, feuille papier.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'app.attendance_signatures'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%capture_mode%'
  LOOP
    EXECUTE format('ALTER TABLE app.attendance_signatures DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE app.attendance_signatures
  ADD CONSTRAINT attendance_signatures_capture_mode_check
  CHECK (capture_mode IS NULL OR capture_mode IN ('lien', 'lien_equipe', 'qr', 'tablette', 'visio', 'grille', 'zoom', 'papier'));

CREATE OR REPLACE FUNCTION app.attendance_self_signed(
  p_capture_mode TEXT, p_evidence_source TEXT, p_signed_at TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_signed_at IS NOT NULL AND (
    p_capture_mode IN ('lien', 'lien_equipe', 'qr', 'tablette', 'visio')
    OR (p_capture_mode IS NULL AND p_evidence_source IN ('qr', 'manual')))
$$;

-- ── 2. Fenêtres : pause déjeuner de l'organisme ─────────────────────────────
-- Matin : du début à la pause (ou à la fin si la séance s'arrête avant la
-- reprise). Après-midi : de la reprise (ou du début si la séance commence
-- pendant la pause) à la fin.
CREATE OR REPLACE FUNCTION app.attendance_sheet_window(
  p_sheet_id UUID,
  OUT window_start TIMESTAMPTZ,
  OUT window_end TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    CASE WHEN sh.half_day = 'afternoon' AND s.starts_at < b.pause THEN GREATEST(s.starts_at, b.reprise)
         ELSE s.starts_at END,
    CASE WHEN sh.half_day = 'morning' AND s.ends_at > b.reprise THEN LEAST(s.ends_at, b.pause)
         ELSE s.ends_at END
  FROM app.attendance_sheets sh
  JOIN app.sessions s ON s.id = sh.session_id
  JOIN app.organizations o ON o.id = sh.organization_id
  CROSS JOIN LATERAL (
    SELECT
      (((s.starts_at AT TIME ZONE 'Europe/Paris')::date + o.attendance_lunch_start) AT TIME ZONE 'Europe/Paris') AS pause,
      (((s.starts_at AT TIME ZONE 'Europe/Paris')::date + o.attendance_lunch_end)   AT TIME ZONE 'Europe/Paris') AS reprise
  ) b
  WHERE sh.id = p_sheet_id
$$;

CREATE OR REPLACE FUNCTION app.attendance_session_windows(p_session_id UUID)
RETURNS TABLE (sheet_id UUID, half_day TEXT, window_start TIMESTAMPTZ, window_end TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT sh.id, sh.half_day, w.window_start, w.window_end
  FROM app.attendance_sheets sh
  CROSS JOIN LATERAL app.attendance_sheet_window(sh.id) w
  WHERE sh.session_id = p_session_id
$$;

-- ── 3. Création des feuilles : pause, replanification, plusieurs jours ──────
CREATE OR REPLACE FUNCTION app.materialize_attendance_slots(p_session_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  s        RECORD;
  v_start  time;
  v_end    time;
  v_matin  boolean;
  v_aprem  boolean;
  v_created int := 0;
BEGIN
  SELECT s2.id, s2.organization_id, s2.dossier_id, s2.starts_at, s2.ends_at, s2.status,
         o.attendance_lunch_start AS pause, o.attendance_lunch_end AS reprise
    INTO s
    FROM app.sessions s2
    JOIN app.organizations o ON o.id = s2.organization_id
   WHERE s2.id = p_session_id;
  IF NOT FOUND OR s.status = 'cancelled' THEN
    RETURN 0;
  END IF;

  -- Ne pas mélanger avec un émargement en feuille unique déjà posé.
  IF EXISTS (SELECT 1 FROM app.attendance_sheets WHERE session_id = s.id AND half_day = 'full') THEN
    RETURN 0;
  END IF;

  v_start := (s.starts_at AT TIME ZONE 'Europe/Paris')::time;
  v_end   := (s.ends_at   AT TIME ZONE 'Europe/Paris')::time;
  IF (s.starts_at AT TIME ZONE 'Europe/Paris')::date <> (s.ends_at AT TIME ZONE 'Europe/Paris')::date THEN
    -- Séance sur plusieurs jours ou passant minuit : une feuille unique.
    v_matin := false;
    v_aprem := false;
  ELSE
    v_matin := v_start < s.pause;
    v_aprem := v_end > s.reprise OR v_start >= s.pause;
  END IF;

  -- Replanification : les demi-journées devenues sans objet disparaissent si
  -- elles sont vierges ; une feuille déjà signée n'est jamais supprimée.
  DELETE FROM app.attendance_sheets sh
   WHERE sh.session_id = s.id
     AND sh.status NOT IN ('finalized', 'completed')
     AND ((sh.half_day = 'morning' AND NOT v_matin) OR (sh.half_day = 'afternoon' AND NOT v_aprem))
     AND NOT EXISTS (SELECT 1 FROM app.attendance_signatures g WHERE g.attendance_sheet_id = sh.id);

  IF v_matin THEN
    INSERT INTO app.attendance_sheets (organization_id, dossier_id, session_id, half_day, status)
    VALUES (s.organization_id, s.dossier_id, s.id, 'morning', 'open')
    ON CONFLICT (session_id, half_day) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END IF;

  IF v_aprem THEN
    INSERT INTO app.attendance_sheets (organization_id, dossier_id, session_id, half_day, status)
    VALUES (s.organization_id, s.dossier_id, s.id, 'afternoon', 'open')
    ON CONFLICT (session_id, half_day) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END IF;

  IF NOT v_matin AND NOT v_aprem AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets WHERE session_id = s.id) THEN
    INSERT INTO app.attendance_sheets (organization_id, dossier_id, session_id, half_day, status)
    VALUES (s.organization_id, s.dossier_id, s.id, 'full', 'open')
    ON CONFLICT (session_id, half_day) DO NOTHING;
    IF FOUND THEN v_created := v_created + 1; END IF;
  END IF;

  RETURN v_created;
END;
$$;

-- ── 4. Signataires attendus : dossiers supprimés et abandons exclus ─────────
CREATE OR REPLACE FUNCTION app.session_expected_signers(p_session_id UUID)
RETURNS TABLE (participant_kind TEXT, participant_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH seance AS (
    SELECT s.id, s.dossier_id, (s.starts_at AT TIME ZONE 'Europe/Paris')::date AS jour
    FROM app.sessions s WHERE s.id = p_session_id
  ),
  dossiers_session AS (
    SELECT d.id, d.learner_id
    FROM app.dossiers d, seance
    WHERE d.deleted_at IS NULL
      AND (d.abandoned_at IS NULL OR seance.jour <= d.abandoned_at)
      AND (d.id = seance.dossier_id
           OR (d.id IN (SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = p_session_id)
               AND (d.start_date IS NULL OR d.end_date IS NULL OR seance.jour BETWEEN d.start_date AND d.end_date)))
  ),
  retires AS (
    SELECT sp.participant_kind, sp.participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.source = 'manual_remove'
  ),
  candidats AS (
    -- Apprenants ajoutés à la main, et apprenants des dossiers vivants de la séance.
    SELECT 'learner'::text AS participant_kind, sp.learner_id AS participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'learner' AND sp.source = 'manual_add'
    UNION
    SELECT 'learner', ds.learner_id FROM dossiers_session ds
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

-- ── 5. Signature d'une étape (canal du lien, retard conservé, visio) ────────
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

-- ── 6. Marquage par l'équipe, formateurs compris ────────────────────────────
DROP FUNCTION IF EXISTS app.set_attendance_mark(UUID, UUID, app.attendance_status, TIME, TIME, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION app.set_attendance_mark(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
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
  IF p_signer_kind NOT IN ('learner', 'trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;
  IF p_capture_mode NOT IN ('grille', 'visio', 'papier') THEN
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
  IF v_sheet.status IN ('finalized', 'completed') THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.session_expected_signers(v_sheet.session_id) e
    WHERE e.participant_kind = p_signer_kind AND e.participant_id = p_signer_id
  ) THEN
    RAISE EXCEPTION 'signer_not_expected' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind, learner_id, trainer_id,
    status, signed_at, evidence_source, capture_mode,
    late_arrival_time, early_departure_time, absence_reason, marked_by
  ) VALUES (
    v_sheet.organization_id, p_attendance_sheet_id, p_signer_kind,
    CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
    CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
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

-- ── 7. Sortie attestée par l'équipe (sortie oubliée) ────────────────────────
CREATE OR REPLACE FUNCTION app.attest_attendance_exit(
  p_attendance_sheet_id UUID,
  p_learner_id UUID,
  p_exit_time TIME,
  p_actor UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_sheet RECORD;
  v_win   RECORD;
  v_row   app.attendance_signatures;
  v_exit  TIMESTAMPTZ;
BEGIN
  SELECT sh.id, sh.status INTO v_sheet
    FROM app.attendance_sheets sh WHERE sh.id = p_attendance_sheet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_sheet.status IN ('finalized', 'completed') THEN
    RAISE EXCEPTION 'attendance_sheet_finalized' USING ERRCODE = 'P0010';
  END IF;

  SELECT * INTO v_row FROM app.attendance_signatures
   WHERE attendance_sheet_id = p_attendance_sheet_id
     AND participant_kind = 'learner' AND learner_id = p_learner_id
   FOR UPDATE;
  IF NOT FOUND OR v_row.signed_at IS NULL OR v_row.status NOT IN ('present', 'late', 'remote') THEN
    RAISE EXCEPTION 'entry_required' USING ERRCODE = 'P0001';
  END IF;
  IF v_row.exit_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_signed_exit' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_win FROM app.attendance_sheet_window(p_attendance_sheet_id);
  v_exit := ((v_win.window_start AT TIME ZONE 'Europe/Paris')::date + p_exit_time) AT TIME ZONE 'Europe/Paris';
  IF v_exit < v_win.window_start OR v_exit > v_win.window_end THEN
    RAISE EXCEPTION 'outside_signing_window' USING ERRCODE = 'P0001';
  END IF;

  UPDATE app.attendance_signatures
     SET exit_signed_at       = v_exit,
         exit_attested_by     = p_actor,
         early_departure_time = CASE WHEN v_exit < v_win.window_end - interval '15 minutes'
                                     THEN p_exit_time ELSE early_departure_time END
   WHERE id = v_row.id;
END $$;

-- ── 8. Verrou : insertions comprises, clôture en cours ──────────────────────
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

  IF v_sheet_status IN ('finalized', 'completed') THEN
    -- Seul effacement admis, et seulement une fois la feuille clôturée :
    -- IP, navigateur, pays, notes passés à NULL (purge à 5 ans, anonymisation).
    IF TG_OP = 'UPDATE' AND v_sheet_status = 'finalized'
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
      MESSAGE = 'attendance_sheet_finalized : feuille clôturée, modification interdite';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS tg_attendance_signature_immutable ON app.attendance_signatures;
CREATE TRIGGER tg_attendance_signature_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_signature_immutable();

-- ── 9. Qualiopi : feuilles de groupe comprises ──────────────────────────────
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
  v_org        UUID;
  v_formation  UUID;
  v_action     TEXT;
  v_certifying BOOLEAN := false;
  v_checks     JSONB;
  v_details    JSONB;
BEGIN
  SELECT organization_id, formation_id, action_type::text
    INTO v_org, v_formation, v_action
  FROM app.dossiers WHERE id = p_dossier_id;

  -- Sans catégorie renseignée, le dossier est une action de formation (L. 6313-1, 1°).
  v_action := COALESCE(v_action, 'action_formation');

  -- Vérifications issues de la formation.
  SELECT
    jsonb_build_object(
      'formation_objectives',
        COALESCE(cardinality(array_remove(f.objectives, '')) > 0, false),
      'formation_pedagogy',
        COALESCE(btrim(f.pedagogical_method) <> '', false),
      'formation_programme',
        COALESCE(
          (f.metadata -> 'catalog' -> 'programme') IS NOT NULL
          OR btrim(COALESCE(f.metadata -> 'catalog' ->> 'programContent', '')) <> ''
          OR btrim(COALESCE(f.description, '')) <> '',
          false),
      'formation_evaluation_method',
        COALESCE(btrim(f.evaluation_method) <> '', false)
    ),
    COALESCE(btrim(COALESCE(f.rncp_code, '')) <> '' OR btrim(COALESCE(f.rs_code, '')) <> '', false)
  INTO v_checks, v_certifying
  FROM app.formations f
  WHERE f.id = v_formation;

  -- Vérifications issues de l'activité du dossier.
  v_checks := COALESCE(v_checks, '{}'::jsonb) || jsonb_build_object(
    'questionnaire_positionnement', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'positionnement'
        AND qa.status = 'completed'),
    'questionnaire_evaluation_acquis', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'evaluation_acquis'
        AND qa.status = 'completed'),
    'satisfaction_chaud', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_chaud'
        AND qa.status = 'completed'),
    'satisfaction_froid', EXISTS (
      SELECT 1 FROM app.questionnaire_assignments qa
      JOIN app.questionnaire_templates qt ON qt.id = qa.template_id
      WHERE qa.dossier_id = p_dossier_id AND qt.kind = 'satisfaction_froid'
        AND qa.status = 'completed'),
    -- Feuilles du dossier, y compris celles des sessions de groupe (sans dossier).
    'attendance_finalized', (
      EXISTS (SELECT 1 FROM app.attendance_sheets s
              WHERE s.dossier_id = p_dossier_id
                 OR s.session_id IN (SELECT sd.session_id FROM app.session_dossiers sd WHERE sd.dossier_id = p_dossier_id))
      AND NOT EXISTS (SELECT 1 FROM app.attendance_sheets s
                      WHERE (s.dossier_id = p_dossier_id
                             OR s.session_id IN (SELECT sd.session_id FROM app.session_dossiers sd WHERE sd.dossier_id = p_dossier_id))
                        AND s.status <> 'finalized')),
    -- Indicateur 9 : convocation envoyée (J-7) ou document de convocation généré.
    'convocation_sent', (
      EXISTS (SELECT 1 FROM app.email_log e
              WHERE e.dossier_id = p_dossier_id AND e.kind LIKE 'convocation%'
                AND e.status = 'sent')
      OR EXISTS (SELECT 1 FROM app.documents doc
                 WHERE doc.dossier_id = p_dossier_id AND doc.kind = 'convocation'
                   AND doc.deleted_at IS NULL)),
    'trainer_assigned', EXISTS (
      SELECT 1 FROM app.dossier_trainers dt WHERE dt.dossier_id = p_dossier_id),
    'document_signed', EXISTS (
      SELECT 1 FROM app.documents d
      JOIN app.document_signatures ds ON ds.document_id = d.id
      WHERE d.dossier_id = p_dossier_id AND ds.status = 'signed')
  );

  WITH referentiel AS (
    -- Version en vigueur à la date du jour.
    SELECT i.*
    FROM app.qualiopi_indicators i
    WHERE i.scope = 'dossier'
      AND i.is_active
      AND i.referential_version <> 'legacy'
      AND (i.effective_from  IS NULL OR i.effective_from  <= CURRENT_DATE)
      AND (i.effective_until IS NULL OR i.effective_until >= CURRENT_DATE)
  ),
  resolved AS (
    SELECT
      i.id     AS indicator_id,
      i.number,
      i.code,
      i.auto_checks,
      -- Applicabilité : catégorie d'action du dossier, et prestation certifiante.
      ((i.applies_to IS NULL OR (v_action IS NOT NULL AND v_action = ANY (i.applies_to)))
        AND (NOT i.certifying_only OR v_certifying))                  AS applicable,
      COALESCE(orul.stage, srul.stage, 'none')                        AS stage,
      COALESCE(orul.is_blocking, srul.is_blocking, false)             AS is_blocking,
      COALESCE(orul.satisfaction_source, srul.satisfaction_source, 'proof') AS source
    FROM referentiel i
    LEFT JOIN app.qualiopi_indicator_rules srul
      ON srul.indicator_id = i.id AND srul.organization_id IS NULL
     AND srul.is_active AND srul.deleted_at IS NULL
    LEFT JOIN app.qualiopi_indicator_rules orul
      ON orul.indicator_id = i.id AND orul.organization_id = v_org
     AND orul.is_active AND orul.deleted_at IS NULL
  ),
  evaluated AS (
    SELECT
      r.*,
      CASE WHEN NOT r.applicable THEN false ELSE (
        -- Toutes les vérifications automatiques de l'indicateur passent…
        (cardinality(r.auto_checks) > 0 AND NOT EXISTS (
           SELECT 1 FROM unnest(r.auto_checks) AS k
           WHERE NOT COALESCE((v_checks ->> k)::boolean, false)))
        -- …ou une preuve valide est déposée pour ce dossier…
        OR EXISTS (
          SELECT 1 FROM app.qualiopi_proofs p
          WHERE p.dossier_id = p_dossier_id
            -- Une preuve reste valable d'une version à l'autre, au même numéro.
            AND p.indicator_id IN (SELECT x.id FROM app.qualiopi_indicators x
                                   WHERE x.number = r.number AND x.referential_version <> 'legacy')
            AND p.deleted_at IS NULL
            AND (p.valid_from  IS NULL OR p.valid_from  <= CURRENT_DATE)
            AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE))
        -- …ou, pour une règle d'organisme fondée sur une source, celle-ci est remplie.
        OR COALESCE((v_checks ->> CASE r.source::text
             WHEN 'questionnaire_positionnement' THEN 'questionnaire_positionnement'
             WHEN 'questionnaire_evaluation'     THEN 'questionnaire_evaluation_acquis'
             WHEN 'attendance_signed'            THEN 'attendance_finalized'
             WHEN 'document_signed'              THEN 'document_signed'
           END)::boolean, false)
      ) END AS is_satisfied,
      (SELECT COALESCE(jsonb_object_agg(k, COALESCE((v_checks ->> k)::boolean, false)), '{}'::jsonb)
         FROM unnest(r.auto_checks) AS k) AS checks
    FROM resolved r
  )
  SELECT
    count(*) FILTER (WHERE applicable)::int,
    count(*) FILTER (WHERE applicable AND is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND stage = 'entry'   AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND stage = 'closing' AND is_blocking AND NOT is_satisfied)::int,
    count(*) FILTER (WHERE applicable AND is_blocking AND NOT is_satisfied)::int,
    COALESCE(jsonb_agg(jsonb_build_object(
      'indicator_id', indicator_id,
      'number',       number,
      'code',         code,
      'applicable',   applicable,
      -- Un indicateur non applicable ne bloque rien et n'a pas d'étape.
      'stage',        CASE WHEN applicable THEN stage::text ELSE 'none' END,
      'is_blocking',  applicable AND is_blocking,
      'satisfied',    is_satisfied,
      'source',       source,
      'checks',       checks
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
    computed_at              = now(),
    total_indicators         = EXCLUDED.total_indicators,
    satisfied_indicators     = EXCLUDED.satisfied_indicators,
    blocking_missing         = EXCLUDED.blocking_missing,
    entry_blocking_missing   = EXCLUDED.entry_blocking_missing,
    closing_blocking_missing = EXCLUDED.closing_blocking_missing,
    details                  = EXCLUDED.details;
END $$;

-- Tout changement de feuille recalcule la conformité ET les heures de chaque
-- dossier de la séance (une feuille de groupe n'a pas de dossier propre).
CREATE OR REPLACE FUNCTION app.tg_attendance_sheet_recompute_dossiers()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_session UUID;
  d RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN v_session := OLD.session_id; ELSE v_session := NEW.session_id; END IF;
  FOR d IN
    SELECT dd.id FROM app.dossiers dd
    WHERE dd.deleted_at IS NULL
      AND (dd.id IN (SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = v_session)
           OR dd.id = (SELECT s.dossier_id FROM app.sessions s WHERE s.id = v_session))
  LOOP
    PERFORM app.recompute_qualiopi_checklist(d.id);
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_attendance_sheets_recompute_qualiopi ON app.attendance_sheets;
CREATE TRIGGER tg_attendance_sheets_recompute_qualiopi
  AFTER INSERT OR DELETE OR UPDATE OF status, dossier_id ON app.attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_sheet_recompute_dossiers();

-- ── 10. Heures : pause exclue, Zoom au réel, rattrapage nocturne ────────────
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
          - GREATEST(f.window_start,
                COALESCE((f.jour + f.late_arrival_time) AT TIME ZONE 'Europe/Paris',
                         CASE WHEN f.evidence_source IN ('zoom_csv', 'zoom_api') THEN (f.evidence_payload ->> 'joinTime')::timestamptz END,
                         f.window_start))
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

CREATE OR REPLACE FUNCTION app.recompute_recent_dossier_hours()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  d RECORD;
  n INT := 0;
BEGIN
  FOR d IN
    SELECT DISTINCT sd.dossier_id AS id
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    JOIN app.dossiers dd ON dd.id = sd.dossier_id AND dd.deleted_at IS NULL
    WHERE s.status <> 'cancelled' AND s.ends_at BETWEEN now() - interval '3 days' AND now()
  LOOP
    PERFORM app.recompute_dossier_hours(d.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ── 11. Anciennes fonctions retirées ────────────────────────────────────────
-- Plus aucun appel : elles écrasaient une signature existante.
DROP FUNCTION IF EXISTS app.record_attendance_signature(UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS app.consume_attendance_token(UUID, UUID, UUID, TEXT, INET);
DROP FUNCTION IF EXISTS app.tg_emit_hours_dirty();

-- ── 12. Tâches planifiées lancées par la base ───────────────────────────────
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_net indisponible (%), tâches à planifier ailleurs', SQLERRM;
  END;
END $$;

-- Appelle une route /api/cron de l'application avec le secret du coffre.
-- Sans secret enregistré (ou sans pg_net / coffre), ne fait rien.
CREATE OR REPLACE FUNCTION app.call_cron_endpoint(p_path TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_secret TEXT;
  v_url    TEXT;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'net' AND p.proname = 'http_post') THEN
    RETURN;
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1' INTO v_secret USING 'cron_secret';
  IF v_secret IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1' INTO v_url USING 'app_url';
  v_url := rtrim(COALESCE(v_url, 'https://capsule-ia.up.railway.app'), '/');
  EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 120000)'
    USING v_url || p_path, '{}'::jsonb,
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json');
END $$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule('capsule_emargement_liens', '*/10 * * * *',
      $c$SELECT app.call_cron_endpoint('/api/cron/emargement-liens')$c$);
    PERFORM cron.schedule('capsule_dispatch_events', '*/5 * * * *',
      $c$SELECT app.call_cron_endpoint('/api/cron/dispatch-events')$c$);
    PERFORM cron.schedule('capsule_transactional_emails', '0 7 * * *',
      $c$SELECT app.call_cron_endpoint('/api/cron/transactional-emails')$c$);
    PERFORM cron.schedule('capsule_heures_recentes', '30 2 * * *',
      $c$SELECT app.recompute_recent_dossier_hours()$c$);
  END IF;
END $do$;

-- ── 13. Droits : service role uniquement, sans connexion exclue ─────────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'app.materialize_attendance_slots(uuid)',
    'app.attendance_sheet_window(uuid)',
    'app.attendance_session_windows(uuid)',
    'app.session_expected_signers(uuid)',
    'app.consume_attendance_token_step(uuid, uuid, uuid, text, text, inet)',
    'app.record_attendance_step(uuid, uuid, text, text, text, text, inet, text, character, uuid, text, uuid)',
    'app.set_attendance_mark(uuid, uuid, text, app.attendance_status, time, time, text, text, uuid)',
    'app.attest_attendance_exit(uuid, uuid, time, uuid)',
    'app.get_signature_context(uuid, uuid, text)',
    'app.recompute_recent_dossier_hours()',
    'app.call_cron_endpoint(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  REVOKE ALL ON FUNCTION app.tg_attendance_sheet_recompute_dossiers() FROM PUBLIC, anon, authenticated;
END $$;

-- ── 14. Recalculs ───────────────────────────────────────────────────────────
-- Séances à venir ou d'hier : feuilles alignées sur la pause déjeuner.
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT id FROM app.sessions WHERE status <> 'cancelled' AND ends_at > now() - interval '1 day' LOOP
    PERFORM app.materialize_attendance_slots(s.id);
  END LOOP;
END $$;

SELECT app.recompute_open_qualiopi_checklists();

DO $$
DECLARE d RECORD;
BEGIN
  FOR d IN SELECT id FROM app.dossiers WHERE deleted_at IS NULL LOOP
    PERFORM app.recompute_dossier_hours(d.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
