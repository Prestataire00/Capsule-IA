-- ============================================================================
-- 0163 — Demande créée à la main, sans formation du catalogue
--
-- Certaines demandes portent sur une formation montée pour le cas précis du
-- client : elle n'existe pas encore au catalogue au moment où l'organisme
-- enregistre la demande. On garde donc l'intitulé voulu (et, si connus, la
-- durée et le tarif) sur la demande ; la formation est créée à la conversion
-- en dossier, qui exige une formation.
-- ============================================================================

ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS custom_formation_title TEXT,
  ADD COLUMN IF NOT EXISTS custom_formation_hours NUMERIC(8, 2)
    CHECK (custom_formation_hours IS NULL OR custom_formation_hours > 0),
  ADD COLUMN IF NOT EXISTS custom_formation_price_cents BIGINT
    CHECK (custom_formation_price_cents IS NULL OR custom_formation_price_cents >= 0);

COMMENT ON COLUMN app.prospects.custom_formation_title IS
  'Formation demandée hors catalogue : intitulé saisi par l''organisme. La formation est créée à la conversion en dossier.';
COMMENT ON COLUMN app.prospects.custom_formation_hours IS 'Durée prévue (heures) de la formation hors catalogue.';
COMMENT ON COLUMN app.prospects.custom_formation_price_cents IS 'Tarif HT prévu de la formation hors catalogue, repris par le devis.';

NOTIFY pgrst, 'reload schema';
