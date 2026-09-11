-- ============================================================================
-- 0154 — Acomptes, soldes, avoirs et relances automatiques
--
-- Une facture a désormais un type : facture, facture d'acompte, facture de
-- solde (devis − acomptes) ou avoir. Un avoir annule tout ou partie d'une
-- facture émise — on ne supprime ni ne modifie jamais une facture émise — et
-- suit sa propre série continue AV-AAAA-NNN.
-- ============================================================================

ALTER TABLE app.invoices
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS related_invoice_id UUID REFERENCES app.invoices(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_kind_check') THEN
    ALTER TABLE app.invoices
      ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('invoice', 'deposit', 'balance', 'credit_note'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_credit_note_related') THEN
    ALTER TABLE app.invoices
      ADD CONSTRAINT invoices_credit_note_related CHECK (kind <> 'credit_note' OR related_invoice_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_invoices_related ON app.invoices(related_invoice_id) WHERE related_invoice_id IS NOT NULL;

COMMENT ON COLUMN app.invoices.kind IS
  'invoice = facture ; deposit = facture d''acompte ; balance = facture de solde (devis − acomptes) ; credit_note = avoir (montants positifs, à déduire).';
COMMENT ON COLUMN app.invoices.related_invoice_id IS 'Avoir : facture annulée (en tout ou partie).';

-- Relances de paiement automatiques (désactivées par défaut : l'organisme les
-- active en connaissance de cause, un e-mail part alors sans intervention).
ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS auto_payment_reminders BOOLEAN NOT NULL DEFAULT false;

-- Série des avoirs.
ALTER TABLE app.document_counters DROP CONSTRAINT IF EXISTS document_counters_prefix_check;
ALTER TABLE app.document_counters
  ADD CONSTRAINT document_counters_prefix_check CHECK (prefix IN ('DEV', 'FAC', 'AV'));

CREATE OR REPLACE FUNCTION app.next_document_number(p_org UUID, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::INT;
  v_base INT;
  v_next INT;
BEGIN
  IF p_prefix NOT IN ('DEV', 'FAC', 'AV') THEN
    RAISE EXCEPTION 'préfixe de numérotation inconnu : %', p_prefix;
  END IF;

  IF COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     AND (p_org IS DISTINCT FROM app.current_organization_id()
          OR NOT (app.is_staff() OR app.has_role('comptable'))) THEN
    RAISE EXCEPTION 'numérotation refusée' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX((regexp_match(r.reference, '^' || p_prefix || '-' || v_year || '-(\d+)$'))[1]::INT), 0)
    INTO v_base
  FROM (
    SELECT reference FROM app.invoices WHERE organization_id = p_org AND p_prefix IN ('FAC', 'AV')
    UNION ALL
    SELECT reference FROM app.quotes WHERE organization_id = p_org AND p_prefix = 'DEV'
  ) r;

  INSERT INTO app.document_counters (organization_id, prefix, year, last_value)
  VALUES (p_org, p_prefix, v_year, v_base + 1)
  ON CONFLICT (organization_id, prefix, year)
  DO UPDATE SET last_value = GREATEST(app.document_counters.last_value, v_base) + 1
  RETURNING last_value INTO v_next;

  RETURN p_prefix || '-' || v_year || '-' || lpad(v_next::TEXT, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION app.next_document_number(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.next_document_number(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
