-- ============================================================================
-- Tests pgTAP : types de facture (0154) — avoir obligatoirement rattaché à une
-- facture, type borné, série AV autorisée.
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT has_column('app', 'invoices', 'kind', 'type de facture');
SELECT has_column('app', 'invoices', 'related_invoice_id', 'facture annulée par un avoir');
SELECT has_column('app', 'organizations', 'auto_payment_reminders', 'relances automatiques');
SELECT col_default_is('app', 'organizations', 'auto_payment_reminders', 'false', 'relances désactivées par défaut');

SELECT throws_ok(
  $$SELECT app.next_document_number('00000000-0000-0000-0000-00000000000a'::uuid, 'XX')$$,
  NULL, NULL, 'préfixe inconnu refusé');

SELECT * FROM finish();
ROLLBACK;
