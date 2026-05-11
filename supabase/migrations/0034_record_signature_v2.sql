-- ============================================================================
-- 0034 — RPC record_attendance_signature v2 (anti-replay + country + evidence)
-- ============================================================================
-- Remplace la version 0026. Ajoute :
--   - Anti-replay : appel app.consume_attendance_token(jti, ...) en transaction
--   - signer_country (cf-ipcountry)
--   - evidence_source / evidence_payload
--   - Insertion event outbox SignatureRecorded

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

  -- Lock sheet row + récup org
  SELECT organization_id INTO v_org_id
    FROM app.attendance_sheets
   WHERE id = p_attendance_sheet_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Anti-replay (seulement si token fourni — override manuel n'en a pas)
  IF p_token_jti IS NOT NULL THEN
    PERFORM app.consume_attendance_token(
      p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, p_signer_ip
    );
  END IF;

  -- UPSERT signature
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

  -- Outbox event
  INSERT INTO infra.domain_events (id, organization_id, aggregate_id, kind, payload)
  VALUES (
    uuidv7(), v_org_id, p_attendance_sheet_id, 'SignatureRecorded',
    jsonb_build_object(
      'signatureId', v_signature_id,
      'signerKind', p_signer_kind,
      'signerId', p_signer_id,
      'evidenceSource', p_evidence_source
    )
  );

  RETURN v_signature_id;
END;
$$;

-- Supprimer l'ancienne signature (8 args) et privilèges
DROP FUNCTION IF EXISTS app.record_attendance_signature(
  UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, UUID
);

REVOKE ALL ON FUNCTION app.record_attendance_signature(
  UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_attendance_signature(
  UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, JSONB
) TO service_role;
