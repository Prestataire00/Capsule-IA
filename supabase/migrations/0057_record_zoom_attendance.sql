-- ============================================================================
-- 0044 — RPC record_zoom_attendance : capture Zoom à précédence humaine
-- ============================================================================
-- Règle : l'auto-sync Zoom ne remplit QUE les présences manquantes ou
-- déjà d'origine Zoom. Il ne remplace JAMAIS une signature humaine
-- (manual / qr / trainer_override). Une feuille finalisée est déjà bloquée
-- par le trigger d'immutabilité 0033.
-- Retour : 'recorded' (insert/update Zoom) | 'skipped_human' (signature humaine préservée).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.record_zoom_attendance(
  p_attendance_sheet_id UUID,
  p_learner_id UUID,
  p_status app.attendance_status,
  p_signature_hash TEXT,
  p_evidence_source TEXT,
  p_evidence_payload JSONB
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org_id UUID;
  v_existing_source TEXT;
BEGIN
  IF p_evidence_source NOT IN ('zoom_api','zoom_csv') THEN
    RAISE EXCEPTION 'invalid_zoom_evidence_source' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id INTO v_org_id
    FROM app.attendance_sheets
   WHERE id = p_attendance_sheet_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Précédence : ne jamais écraser une signature d'origine humaine
  SELECT evidence_source INTO v_existing_source
    FROM app.attendance_signatures
   WHERE attendance_sheet_id = p_attendance_sheet_id
     AND participant_kind = 'learner'
     AND learner_id = p_learner_id;

  IF v_existing_source IN ('manual','qr','trainer_override') THEN
    RETURN 'skipped_human';
  END IF;

  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind, learner_id,
    status, signed_at, signer_user_agent,
    signature_hash, evidence_source, evidence_payload
  ) VALUES (
    v_org_id, p_attendance_sheet_id, 'learner', p_learner_id,
    p_status, now(), 'zoom-api-sync',
    p_signature_hash, p_evidence_source, p_evidence_payload
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id) DO UPDATE
    SET status = EXCLUDED.status,
        signed_at = EXCLUDED.signed_at,
        evidence_source = EXCLUDED.evidence_source,
        evidence_payload = EXCLUDED.evidence_payload
    WHERE app.attendance_signatures.evidence_source IN ('zoom_api','zoom_csv');

  RETURN 'recorded';
END $$;

REVOKE ALL ON FUNCTION app.record_zoom_attendance(UUID, UUID, app.attendance_status, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_zoom_attendance(UUID, UUID, app.attendance_status, TEXT, TEXT, JSONB) TO service_role;
