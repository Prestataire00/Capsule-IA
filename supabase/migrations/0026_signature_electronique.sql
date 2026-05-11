-- ============================================================================
-- 0026 — Signature électronique : bucket Storage + RPC lecture/écriture
-- ============================================================================
-- Le token JWT (HS256, TTL 24h) est vérifié côté Next.js avec TOKEN_SIGNING_KEY.
-- Une fois validé, le payload {attendance_sheet_id, signer_id, signer_kind, jti}
-- est passé à ces RPC. La sécurité d'accès vient du JWT, pas de RLS.

-- ── Bucket Storage privé pour les PNG de signature ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signatures',
  'signatures',
  false,
  524288, -- 512 KB max
  ARRAY['image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Lecture des PNG signature pour les membres authentifiés (audit Qualiopi)
CREATE POLICY "signatures_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures');

-- Pas de policy INSERT/UPDATE/DELETE : l'upload passe par Server Action service_role


-- ── RPC publique : contexte pour la page /signer/[token] ────────────────────
-- Appelée par le Server Component avec anon key APRÈS validation du JWT côté Next.
-- Aucune protection RLS — on suppose que le caller a déjà vérifié le JWT signature.

CREATE OR REPLACE FUNCTION app.get_signature_context(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT
)
RETURNS TABLE (
  attendance_sheet_id UUID,
  signer_id UUID,
  signer_kind TEXT,
  signer_full_name TEXT,
  signer_email TEXT,
  dossier_id UUID,
  dossier_reference TEXT,
  formation_title TEXT,
  session_id UUID,
  session_starts_at TIMESTAMPTZ,
  session_ends_at TIMESTAMPTZ,
  session_modality TEXT,
  organization_id UUID,
  organization_name TEXT,
  already_signed BOOLEAN,
  signed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT
    sh.id,
    p_signer_id,
    p_signer_kind,
    CASE p_signer_kind
      WHEN 'learner' THEN (SELECT l.first_name || ' ' || l.last_name FROM app.learners l WHERE l.id = p_signer_id)
      WHEN 'trainer' THEN (SELECT t.first_name || ' ' || t.last_name FROM app.trainers t WHERE t.id = p_signer_id)
    END,
    CASE p_signer_kind
      WHEN 'learner' THEN (SELECT l.email::text FROM app.learners l WHERE l.id = p_signer_id)
      WHEN 'trainer' THEN (SELECT t.email::text FROM app.trainers t WHERE t.id = p_signer_id)
    END,
    d.id,
    d.reference,
    f.title,
    s.id,
    s.starts_at,
    s.ends_at,
    s.modality::text,
    o.id,
    o.name,
    sig.signed_at IS NOT NULL,
    sig.signed_at
  FROM app.attendance_sheets sh
  JOIN app.sessions s ON s.id = sh.session_id
  JOIN app.dossiers d ON d.id = sh.dossier_id
  JOIN app.formations f ON f.id = d.formation_id
  JOIN app.organizations o ON o.id = sh.organization_id
  LEFT JOIN app.attendance_signatures sig
    ON sig.attendance_sheet_id = sh.id
    AND sig.participant_kind = p_signer_kind
    AND sig.participant_id = p_signer_id
  WHERE sh.id = p_attendance_sheet_id;
$$;

GRANT EXECUTE ON FUNCTION app.get_signature_context(UUID, UUID, TEXT) TO anon, authenticated;


-- ── RPC privée : enregistrement signature ───────────────────────────────────
-- Appelée par Server Action côté Next avec service_role.
-- Idempotente : ré-signer écrase la signature précédente (cas refresh page).

CREATE OR REPLACE FUNCTION app.record_attendance_signature(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_image_path TEXT,
  p_signature_hash TEXT,
  p_signer_ip INET,
  p_signer_user_agent TEXT,
  p_token_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org_id UUID;
  v_signature_id UUID;
BEGIN
  IF p_signer_kind NOT IN ('learner', 'trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM app.attendance_sheets
  WHERE id = p_attendance_sheet_id
  FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id,
    attendance_sheet_id,
    participant_kind,
    learner_id,
    trainer_id,
    status,
    signature_image_path,
    signed_at,
    signer_ip,
    signer_user_agent,
    signature_hash,
    token_id
  ) VALUES (
    v_org_id,
    p_attendance_sheet_id,
    p_signer_kind,
    CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
    CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
    'present',
    p_image_path,
    now(),
    p_signer_ip,
    p_signer_user_agent,
    p_signature_hash,
    p_token_id
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id)
  DO UPDATE SET
    signature_image_path = EXCLUDED.signature_image_path,
    signed_at = EXCLUDED.signed_at,
    signer_ip = EXCLUDED.signer_ip,
    signer_user_agent = EXCLUDED.signer_user_agent,
    signature_hash = EXCLUDED.signature_hash,
    token_id = EXCLUDED.token_id,
    status = 'present'
  RETURNING id INTO v_signature_id;

  RETURN v_signature_id;
END;
$$;

REVOKE ALL ON FUNCTION app.record_attendance_signature(UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_attendance_signature(UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, UUID) TO service_role;
