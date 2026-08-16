-- 0124 — Régime de TVA de l'organisme
--
-- Les prix du catalogue étaient implicitement HT et le formulaire de facture
-- pré-remplissait 20 % en dur — faux pour la majorité des organismes de
-- formation, exonérés au titre de l'article 261-4-4°a du CGI (formation
-- professionnelle continue, sous réserve de l'attestation fiscale).
--
-- Défaut volontairement « exonéré / 0 % » : c'est le cas le plus fréquent, et
-- une TVA oubliée à 0 se rattrape, une TVA facturée à tort beaucoup moins.

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS vat_regime TEXT NOT NULL DEFAULT 'exempt',
  ADD COLUMN IF NOT EXISTS default_vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_vat_regime_check'
  ) THEN
    ALTER TABLE app.organizations
      ADD CONSTRAINT organizations_vat_regime_check
      CHECK (vat_regime IN ('exempt', 'subject'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_default_vat_rate_check'
  ) THEN
    ALTER TABLE app.organizations
      ADD CONSTRAINT organizations_default_vat_rate_check
      CHECK (default_vat_rate >= 0 AND default_vat_rate <= 100);
  END IF;
END $$;

COMMENT ON COLUMN app.organizations.vat_regime IS
  'exempt = exonéré de TVA (art. 261-4-4°a CGI, mention obligatoire sur les factures) ; subject = assujetti.';
COMMENT ON COLUMN app.organizations.default_vat_rate IS
  'Taux de TVA par défaut en %, appliqué aux nouvelles factures et proposé sur les tarifs du catalogue.';

NOTIFY pgrst, 'reload schema';
