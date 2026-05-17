-- ============================================================================
-- Tests pgTAP : RLS par rôle — EXEMPLE (à étendre Sprint A)
-- ============================================================================
-- Démontre le pattern de test des permissions par rôle.
-- Couvre 1 cas par rôle sur app.companies. À répliquer pour les autres
-- tables critiques : learners, dossiers, documents, invoices,
-- attendance_signatures, qualiopi_dossier_checklists.
--
-- Pattern :
--   1. service_role : créer setup data
--   2. set_jwt comme user du rôle testé
--   3. tests.as_authenticated()
--   4. Asserter SELECT/INSERT/UPDATE/DELETE selon la matrice attendue
-- ============================================================================

BEGIN;
SELECT plan(5);

-- ----------------------------------------------------------------------------
-- Setup : 1 OF + 5 users (1 par rôle) + 1 company
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Test', 'OF Test SARL', '99999999999999');

-- 1 user par rôle
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner@of.test',        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('admin-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@of.test',        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur@of.test',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable@of.test',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner',        'owner@of.test'),
  ('admin-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin',        'admin@of.test'),
  ('gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gestionnaire', 'gestionnaire@of.test'),
  ('form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Formateur',    'formateur@of.test'),
  ('compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Comptable',    'comptable@of.test');

INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role,        true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'::app.member_role,        true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur'::app.member_role,    true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable'::app.member_role,    true);

INSERT INTO app.companies (id, organization_id, name) VALUES
  ('comp_x00-0000-0000-0000-000000000001'::uuid, '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme SA');

-- ----------------------------------------------------------------------------
-- TEST 1 : owner peut INSERT company (staff)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();

SELECT lives_ok(
  $$ INSERT INTO app.companies (organization_id, name) VALUES
     ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'New Company by Owner') $$,
  'owner : peut INSERT company (is_staff)'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : admin peut INSERT company (staff)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'admin-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SELECT lives_ok(
  $$ INSERT INTO app.companies (organization_id, name) VALUES
     ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'New Company by Admin') $$,
  'admin : peut INSERT company (is_staff)'
);

-- ----------------------------------------------------------------------------
-- TEST 3 : gestionnaire peut INSERT company (staff)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SELECT lives_ok(
  $$ INSERT INTO app.companies (organization_id, name) VALUES
     ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'New Company by Gestionnaire') $$,
  'gestionnaire : peut INSERT company (is_staff)'
);

-- ----------------------------------------------------------------------------
-- TEST 4 : formateur ne peut PAS INSERT company (not staff)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur', 'form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SELECT throws_ok(
  $$ INSERT INTO app.companies (organization_id, name) VALUES
     ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Forbidden by Formateur') $$,
  '42501',
  NULL,
  'formateur : ne peut PAS INSERT company (not is_staff)'
);

-- ----------------------------------------------------------------------------
-- TEST 5 : comptable ne peut PAS INSERT company (not staff, scope billing only)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable', 'compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SELECT throws_ok(
  $$ INSERT INTO app.companies (organization_id, name) VALUES
     ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Forbidden by Comptable') $$,
  '42501',
  NULL,
  'comptable : ne peut PAS INSERT company (scope billing only)'
);

SELECT * FROM finish();
ROLLBACK;

-- ============================================================================
-- À étendre Sprint A (STORY-A1) :
--   - 0045_test_rls_by_role_learners.sql
--   - 0046_test_rls_by_role_dossiers.sql
--   - 0047_test_rls_by_role_documents.sql
--   - 0048_test_rls_by_role_invoices.sql       (rôle comptable AUTORISÉ ici)
--   - 0049_test_rls_by_role_attendance.sql     (rôle formateur AUTORISÉ ici)
--   - 0050_test_rls_apprenant_token_access.sql (RPCs publiques)
-- ============================================================================
