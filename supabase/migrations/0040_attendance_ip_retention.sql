-- ============================================================================
-- 0040 — RGPD : purge IP/UA/country des signatures > 5 ans (archivage Qualiopi)
-- ============================================================================
-- Durée légale archivage formation professionnelle = 5 ans.
-- Après ce délai, on conserve les preuves de signature (hash, PNG, evidence)
-- mais on supprime les données techniques identifiantes (IP, UA, country).
--
-- Job mensuel : 1er du mois à 04:00 UTC. Idempotent (NULL → NULL est no-op).

SELECT cron.schedule(
  'attendance_purge_ip_yearly',
  '0 4 1 * *',
  $cron$
    UPDATE app.attendance_signatures
       SET signer_ip = NULL,
           signer_user_agent = NULL,
           signer_country = NULL
     WHERE signed_at < now() - interval '5 years'
       AND (signer_ip IS NOT NULL
            OR signer_user_agent IS NOT NULL
            OR signer_country IS NOT NULL);
  $cron$
);

COMMENT ON COLUMN app.attendance_signatures.signer_ip IS
  'IP signataire (cf-connecting-ip). Purgé après 5 ans (cron attendance_purge_ip_yearly).';
