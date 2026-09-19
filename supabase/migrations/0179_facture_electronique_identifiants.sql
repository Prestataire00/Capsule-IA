-- ============================================================================
-- 0179 — Identifiants exigés par la facturation électronique
-- ============================================================================
-- La réforme (loi de finances 2024, art. 91) impose depuis le 1er septembre 2026
-- la réception de factures électroniques à toutes les entreprises, et leur
-- émission aux PME et TPE au 1er septembre 2027. Le SIREN du client y devient
-- une mention obligatoire : c'est le pivot par lequel l'administration rapproche
-- les flux. Une facture qui en manque est rejetée du circuit, donc impayée.
--
-- Deux manques dans le modèle :
--
-- 1. `funders` n'avait AUCUN identifiant. Or un organisme de formation facture
--    surtout des OPCO : `resolveInvoiceRecipient` renvoyait `siret: null` en
--    dur, faute de colonne où en lire un. C'est la majorité des factures émises
--    qui ne portait pas l'identité de son destinataire.
--
-- 2. L'option pour le paiement de la TVA d'après les débits doit figurer sur la
--    facture quand l'organisme l'a prise. Rien ne la stockait.
--
-- Les deux colonnes sont nullables : on ne peut pas exiger rétroactivement un
-- numéro qu'il faudra aller chercher chez chaque financeur. L'écran de saisie
-- le réclame, la base l'accueille.

ALTER TABLE app.funders
  ADD COLUMN IF NOT EXISTS siret CHAR(14);

COMMENT ON COLUMN app.funders.siret IS
  'SIRET du financeur (14 chiffres). Ses 9 premiers chiffres forment le SIREN, '
  'mention obligatoire sur la facture électronique. Nullable : à compléter au fil de l''eau.';

-- Un même financeur ne se saisit pas deux fois dans une organisation.
CREATE UNIQUE INDEX IF NOT EXISTS ux_funders_org_siret
  ON app.funders(organization_id, siret)
  WHERE siret IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS vat_on_debits BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app.organizations.vat_on_debits IS
  'L''organisme a opté pour le paiement de la TVA d''après les débits. Quand c''est '
  'le cas, la mention « Option pour le paiement de la taxe d''après les débits » '
  'doit figurer sur chaque facture.';

NOTIFY pgrst, 'reload schema';
