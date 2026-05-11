-- ============================================================================
-- 0031 — Colonnes additionnelles attendance (split strategy, country, evidence)
-- ============================================================================

ALTER TABLE app.dossier_modules
  ADD COLUMN attendance_split_strategy TEXT NOT NULL DEFAULT 'auto'
    CHECK (attendance_split_strategy IN ('auto','per_day','manual'));

ALTER TABLE app.attendance_signatures
  ADD COLUMN signer_country CHAR(2),
  ADD COLUMN evidence_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (evidence_source IN ('manual','qr','zoom_csv','zoom_api','trainer_override')),
  ADD COLUMN evidence_payload JSONB;

CREATE INDEX ix_attendance_signatures_evidence_source
  ON app.attendance_signatures(organization_id, evidence_source);

COMMENT ON COLUMN app.attendance_signatures.signer_country IS
  'ISO-3166-1 alpha-2, depuis cf-ipcountry (Cloudflare/Railway). NULL si non résolu.';
COMMENT ON COLUMN app.attendance_signatures.evidence_source IS
  'Source de la preuve : manual=formateur, qr=apprenant signe via QR, zoom_*=log Zoom, trainer_override=correction manuelle';
COMMENT ON COLUMN app.attendance_signatures.evidence_payload IS
  'Payload spécifique à la source. Ex: {join,leave,duration,raw_line} pour zoom_*';
