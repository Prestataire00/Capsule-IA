-- ============================================================================
-- Tests pgTAP : RLS cross-tenant baseline (foundation NFR-001)
-- ============================================================================
-- Vérifie qu'un user authentifié dans OF A ne peut PAS lire les rows d'OF B
-- pour les tables-clés du multi-tenant. C'est la base anti-fuite multi-tenant.
--
-- ⚠ Couverture initiale : 4 tables critiques (companies, learners, dossiers,
-- invoices). À étendre au fil du Sprint A pour couvrir toutes les tables app.*
-- avec organization_id (cf. STORY-A1 sprint plan V2).
-- ============================================================================

BEGIN;
SELECT plan(8);

-- ----------------------------------------------------------------------------
-- Setup : 2 orgs + 1 row par table-clé dans chaque org (via service_role)
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('1111aaaa-1111-1111-1111-111111111111', 'admin-a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('2222bbbb-2222-2222-2222-222222222222', 'admin-b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('1111aaaa-1111-1111-1111-111111111111', 'Admin A', 'admin-a@example.com'),
  ('2222bbbb-2222-2222-2222-222222222222', 'Admin B', 'admin-b@example.com');

INSERT INTO app.members (id, organization_id, user_id, role, is_default_org) VALUES
  ('1111ffff-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1111aaaa-1111-1111-1111-111111111111', 'admin'::app.member_role, true),
  ('2222ffff-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2222bbbb-2222-2222-2222-222222222222', 'admin'::app.member_role, true);

-- 1 ligne par table critique dans chaque org
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('comp_aaa0-0000-0000-0000-000000000001'::uuid, 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Client OF A'),
  ('comp_bbb0-0000-0000-0000-000000000001'::uuid, 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Client OF B');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('lear_aaa0-0000-0000-0000-000000000001'::uuid, 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Apprenant A', 'alice-a@example.com'),
  ('lear_bbb0-0000-0000-0000-000000000001'::uuid, 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob',   'Apprenant B', 'bob-b@example.com');

-- ----------------------------------------------------------------------------
-- Switch : admin A authentifié
-- ----------------------------------------------------------------------------

SELECT tests.set_jwt(
  'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'admin',
  '1111aaaa-1111-1111-1111-111111111111',
  '1111ffff-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
SELECT tests.as_authenticated();

-- ----------------------------------------------------------------------------
-- TEST 1-4 : Admin A NE VOIT PAS les rows d'OF B (cross-tenant SELECT)
-- ----------------------------------------------------------------------------

SELECT is(
  (SELECT count(*) FROM app.companies WHERE organization_id = 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)::int,
  0,
  'companies : admin A ne voit pas les companies d''OF B'
);

SELECT is(
  (SELECT count(*) FROM app.learners WHERE organization_id = 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)::int,
  0,
  'learners : admin A ne voit pas les apprenants d''OF B'
);

SELECT is(
  (SELECT count(*) FROM app.members WHERE organization_id = 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)::int,
  0,
  'members : admin A ne voit pas les membres d''OF B'
);

SELECT is(
  (SELECT count(*) FROM app.organizations WHERE id = 'bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid)::int,
  0,
  'organizations : admin A ne voit pas l''OF B (même row organization)'
);

-- ----------------------------------------------------------------------------
-- TEST 5-7 : Admin A VOIT BIEN ses propres rows (sanity check inverse)
-- ----------------------------------------------------------------------------

SELECT is(
  (SELECT count(*) FROM app.companies WHERE organization_id = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)::int,
  1,
  'companies : admin A voit bien sa propre company (sanity check)'
);

SELECT is(
  (SELECT count(*) FROM app.learners WHERE organization_id = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)::int,
  1,
  'learners : admin A voit bien son propre apprenant'
);

SELECT is(
  (SELECT count(*) FROM app.organizations WHERE id = 'aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid)::int,
  1,
  'organizations : admin A voit bien son OF'
);

-- ----------------------------------------------------------------------------
-- TEST 8 : Admin A ne peut pas INSERT dans OF B (cross-tenant write)
-- ----------------------------------------------------------------------------

SELECT throws_ok(
  $$ INSERT INTO app.companies (organization_id, name)
     VALUES ('bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Tentative cross-tenant') $$,
  '42501',
  NULL,
  'companies : admin A ne peut PAS INSERT dans OF B (RLS WITH CHECK)'
);

SELECT * FROM finish();
ROLLBACK;
