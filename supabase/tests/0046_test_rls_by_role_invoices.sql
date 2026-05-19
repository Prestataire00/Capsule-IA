-- ============================================================================
-- Tests pgTAP : RLS par rôle sur app.invoices (cas comptable AUTORISÉ)
-- ============================================================================
-- Matrice attendue (cf. 0023_rls_billing_infra_audit.sql) :
--   owner      : SELECT/INSERT/UPDATE OK
--   admin      : SELECT/INSERT/UPDATE OK
--   comptable  : SELECT/INSERT/UPDATE OK (rôle spécialisé billing)
--   gestionnaire : NON (pas de scope billing par défaut V1)
--   formateur  : NON
-- ============================================================================

BEGIN;
SELECT plan(6);

-- Setup
SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Test', 'OF Test SARL', '99999999999999');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner@of.test',        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur@of.test',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable@of.test',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner',        'owner@of.test'),
  ('gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gestionnaire', 'gestionnaire@of.test'),
  ('form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Formateur',    'formateur@of.test'),
  ('compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Comptable',    'comptable@of.test');

INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role,        true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur'::app.member_role,    true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable'::app.member_role,    true);

-- 1 client et 1 dossier minimal pour FK
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('comp_x00-0000-0000-0000-000000000001'::uuid, '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Client Test');

-- ----------------------------------------------------------------------------
-- TEST 1 : owner peut INSERT invoice (draft)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();
SELECT lives_ok(
  $$ INSERT INTO app.invoices (organization_id, reference, company_id, status, total_ttc_cents)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'FAC-TEST-OWNER', 'comp_x00-0000-0000-0000-000000000001'::uuid, 'draft', 120000) $$,
  'owner : INSERT invoice OK'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : comptable peut INSERT invoice (rôle spécialisé)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable', 'compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$ INSERT INTO app.invoices (organization_id, reference, company_id, status, total_ttc_cents)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'FAC-TEST-COMPT', 'comp_x00-0000-0000-0000-000000000001'::uuid, 'draft', 120000) $$,
  'comptable : INSERT invoice OK (rôle spécialisé billing)'
);

-- ----------------------------------------------------------------------------
-- TEST 3 : comptable peut SELECT invoices
-- ----------------------------------------------------------------------------
SELECT cmp_ok(
  (SELECT count(*)::int FROM app.invoices WHERE organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  '>=',
  1,
  'comptable : SELECT invoices OK'
);

-- ----------------------------------------------------------------------------
-- TEST 4 : gestionnaire NE PEUT PAS INSERT invoice
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT throws_ok(
  $$ INSERT INTO app.invoices (organization_id, reference, company_id, status, total_ttc_cents)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'FAC-TEST-GEST', 'comp_x00-0000-0000-0000-000000000001'::uuid, 'draft', 120000) $$,
  '42501',
  NULL,
  'gestionnaire : INSERT invoice refusé (pas de scope billing)'
);

-- ----------------------------------------------------------------------------
-- TEST 5 : formateur NE PEUT PAS SELECT invoices
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur', 'form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM app.invoices WHERE organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  0,
  'formateur : SELECT invoices retourne 0 (RLS filtre out)'
);

-- ----------------------------------------------------------------------------
-- TEST 6 : invoice paid → UPDATE refusé (policy invoices_update WHERE status NOT IN (paid,cancelled))
-- ----------------------------------------------------------------------------
SELECT tests.as_service_role();
INSERT INTO app.invoices (id, organization_id, reference, company_id, status, total_ttc_cents) VALUES
  ('inv_paid0-0000-0000-0000-000000000001'::uuid, '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FAC-PAID', 'comp_x00-0000-0000-0000-000000000001'::uuid, 'paid', 120000);

SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable', 'compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();

-- UPDATE WHERE status='paid' devrait retourner 0 rows affected (RLS filter)
DO $$
DECLARE v_affected int;
BEGIN
  UPDATE app.invoices SET reference = 'MODIFIED' WHERE id = 'inv_paid0-0000-0000-0000-000000000001'::uuid;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  PERFORM is(v_affected, 0, 'comptable : UPDATE invoice paid refusé (RLS status check)');
END $$;

SELECT * FROM finish();
ROLLBACK;
