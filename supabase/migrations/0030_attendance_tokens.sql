-- ============================================================================
-- 0030 — Anti-replay JTI pour tokens de signature
-- ============================================================================
-- Chaque génération de SignerToken (JWT HS256) insère une ligne 'issued'.
-- La consommation passe à 'consumed' en transaction atomique. Un rejeu lève
-- une erreur P0003. Purge automatique des tokens expirés via pg_cron nightly.

CREATE TABLE app.attendance_token_jtis (
  jti UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  attendance_sheet_id UUID NOT NULL REFERENCES app.attendance_sheets(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL,
  signer_kind TEXT NOT NULL CHECK (signer_kind IN ('learner','trainer')),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued','consumed','expired','revoked')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_ip INET,
  CHECK (expires_at > issued_at)
);

CREATE INDEX ix_token_jtis_sheet ON app.attendance_token_jtis(attendance_sheet_id);
CREATE INDEX ix_token_jtis_expires_open
  ON app.attendance_token_jtis(expires_at) WHERE status = 'issued';

ALTER TABLE app.attendance_token_jtis ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_token_jtis FORCE ROW LEVEL SECURITY;

-- RPC consume_token : appelée par RPC record_attendance_signature (chaîne SECURITY DEFINER)
CREATE OR REPLACE FUNCTION app.consume_attendance_token(
  p_jti UUID,
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_consumed_ip INET
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row app.attendance_token_jtis;
BEGIN
  SELECT * INTO v_row FROM app.attendance_token_jtis
   WHERE jti = p_jti FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_unknown' USING ERRCODE = 'P0003';
  END IF;

  IF v_row.status <> 'issued' THEN
    RAISE EXCEPTION 'token_already_%', v_row.status USING ERRCODE = 'P0003';
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

  UPDATE app.attendance_token_jtis
     SET status = 'consumed', consumed_at = now(), consumed_ip = p_consumed_ip
   WHERE jti = p_jti;
END;
$$;

REVOKE ALL ON FUNCTION app.consume_attendance_token(UUID, UUID, UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_attendance_token(UUID, UUID, UUID, TEXT, INET) TO service_role;

-- pg_cron job nightly : expirer les tokens stale
SELECT cron.schedule(
  'attendance_token_jtis_expire_stale',
  '17 3 * * *',
  $cron$
    UPDATE app.attendance_token_jtis
       SET status = 'expired'
     WHERE status = 'issued' AND expires_at < now();
  $cron$
);
