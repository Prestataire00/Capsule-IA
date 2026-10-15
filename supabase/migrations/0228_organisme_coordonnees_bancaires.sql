-- Les coordonnées bancaires de l'organisme, imprimées sur ses factures pour
-- que le client règle par virement (demande d'Ismael, 15/10/2026).
-- Colonnes de app.organizations : la RLS de la table (lecture par les membres,
-- écriture par owner/admin) s'applique telle quelle.

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS bank_iban TEXT CHECK (bank_iban IS NULL OR bank_iban ~ '^[A-Z]{2}[0-9]{2}[0-9A-Z]{11,30}$'),
  ADD COLUMN IF NOT EXISTS bank_bic TEXT CHECK (bank_bic IS NULL OR bank_bic ~ '^[A-Z0-9]{8}([A-Z0-9]{3})?$'),
  ADD COLUMN IF NOT EXISTS bank_name TEXT CHECK (bank_name IS NULL OR length(bank_name) <= 120);

COMMENT ON COLUMN app.organizations.bank_iban IS 'IBAN sans espaces, imprimé sur les factures.';
COMMENT ON COLUMN app.organizations.bank_bic IS 'BIC/SWIFT, imprimé sur les factures.';
COMMENT ON COLUMN app.organizations.bank_name IS 'Banque (domiciliation), imprimée sur les factures.';
