-- ============================================================================
-- Tests pgTAP : RLS par rôle sur app.learners
-- ============================================================================
-- Matrice attendue (à confirmer vs policies 0019_rls_identity_crm_catalog.sql) :
--   owner          : SELECT/INSERT/UPDATE/DELETE OK (staff)
--   admin          : SELECT/INSERT/UPDATE/DELETE OK (staff)
--   gestionnaire   : SELECT/INSERT/UPDATE OK (staff), DELETE NON (soft delete only)
--   formateur      : SELECT OK (lecture pour ses dossiers), pas INSERT/UPDATE
--   comptable      : SELECT OK (visibilité de base), pas INSERT/UPDATE
-- ============================================================================

BEGIN;
SELECT plan(7);

-- Setup
SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Test', 'OF Test SARL', '99999999999999');

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

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('lear_x00-0000-0000-0000-000000000001'::uuid, '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Test', 'alice@test.com');

-- ----------------------------------------------------------------------------
-- TEST 1 : owner peut SELECT learner
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();
SELECT is(
  (SELECT count(*)::int FROM app.learners WHERE id = 'lear_x00-0000-0000-0000-000000000001'::uuid),
  1,
  'owner : SELECT learner OK'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : owner peut INSERT learner
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$ INSERT INTO app.learners (organization_id, first_name, last_name, email)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'New', 'ByOwner', 'new-owner@test.com') $$,
  'owner : INSERT learner OK'
);

-- ----------------------------------------------------------------------------
-- TEST 3 : gestionnaire peut INSERT learner (staff)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'gest-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT lives_ok(
  $$ INSERT INTO app.learners (organization_id, first_name, last_name, email)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'New', 'ByGest', 'new-gest@test.com') $$,
  'gestionnaire : INSERT learner OK (is_staff)'
);

-- ----------------------------------------------------------------------------
-- TEST 4 : formateur peut SELECT learner (visibilité large pour ses dossiers)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur', 'form-001a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- NOTE : selon la policy actuelle, formateur peut voir tous les learners de son OF.
-- À ajuster si la policy restreint aux dossiers où il est assigné.
SELECT cmp_ok(
  (SELECT count(*)::int FROM app.learners WHERE organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid),
  '>=',
  1,
  'formateur : SELECT learners de son OF OK (au moins 1)'
);

-- ----------------------------------------------------------------------------
-- TEST 5 : formateur ne peut PAS INSERT learner
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO app.learners (organization_id, first_name, last_name, email)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Forbidden', 'ByForm', 'forbidden-form@test.com') $$,
  '42501',
  NULL,
  'formateur : INSERT learner refusé (not is_staff)'
);

-- ----------------------------------------------------------------------------
-- TEST 6 : comptable ne peut PAS INSERT learner
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'comptable', 'compt-01a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT throws_ok(
  $$ INSERT INTO app.learners (organization_id, first_name, last_name, email)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Forbidden', 'ByCompt', 'forbidden-compt@test.com') $$,
  '42501',
  NULL,
  'comptable : INSERT learner refusé (scope billing only)'
);

-- ----------------------------------------------------------------------------
-- TEST 7 : DELETE direct interdit pour tous (soft delete uniquement par convention)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-001-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT throws_ok(
  $$ DELETE FROM app.learners WHERE id = 'lear_x00-0000-0000-0000-000000000001'::uuid $$,
  '42501',
  NULL,
  'owner : DELETE direct refusé (convention soft delete via UPDATE deleted_at)'
);

SELECT * FROM finish();
ROLLBACK;
