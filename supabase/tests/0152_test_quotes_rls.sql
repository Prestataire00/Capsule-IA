-- ============================================================================
-- Tests pgTAP : devis (0152) — RLS forcée partout, numérotation refusée hors
-- de son organisme, aucune écriture pour un membre sans rôle de gestion.
-- ============================================================================
BEGIN;
SELECT plan(12);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.quotes'::regclass), 'RLS activée sur les devis');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.quotes'::regclass), 'RLS forcée sur les devis');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.quote_lines'::regclass), 'RLS forcée sur les lignes');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.quote_dossiers'::regclass), 'RLS forcée sur les dossiers couverts');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.document_counters'::regclass), 'RLS forcée sur les compteurs');

SELECT policies_are('app', 'quotes',
  ARRAY['quotes_select', 'quotes_insert', 'quotes_update', 'quotes_delete'], 'policies des devis');
SELECT policies_are('app', 'quote_lines',
  ARRAY['quote_lines_select', 'quote_lines_insert', 'quote_lines_update', 'quote_lines_delete'], 'policies des lignes');
SELECT policies_are('app', 'document_counters', ARRAY['document_counters_select'],
  'compteurs en lecture seule (écriture par la RPC)');

SELECT has_column('app', 'sessions', 'price_cents', 'tarif de session');
SELECT has_column('app', 'invoices', 'quote_id', 'facture reliée à son devis');

-- Membre d'un organisme A, simple formateur : ni devis, ni numéro.
SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$SELECT app.next_document_number('00000000-0000-0000-0000-00000000000b'::uuid, 'DEV')$$,
  '42501', NULL, 'impossible de numéroter pour un autre organisme');

SELECT throws_ok(
  $$INSERT INTO app.quotes (organization_id, reference, client_kind, object, valid_until)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, 'DEV-TEST-001', 'individual', 'x', CURRENT_DATE)$$,
  '42501', NULL, 'un formateur ne crée pas de devis');

SELECT * FROM finish();
ROLLBACK;
