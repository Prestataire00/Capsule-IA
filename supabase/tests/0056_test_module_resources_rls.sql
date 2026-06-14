-- ============================================================================
-- Tests pgTAP : RLS isolation tenant sur app.module_resources
-- ============================================================================
-- Couverture :
--   1. Un membre staff d'OF A ne voit QUE les module_resources de son org.
--   2. Un membre staff d'OF A ne voit AUCUN module_resource d'OF B (cross-tenant).
--   3. Un rôle anon (pas de JWT) ne voit AUCUN module_resource.
-- ============================================================================

BEGIN;
SELECT plan(4);

-- ----------------------------------------------------------------------------
-- Setup : 2 orgs + users + members + 1 module par org + 1 resource par module
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret, slug, contact_email) VALUES
  ('00560a00-0000-0000-0000-000000000001', 'OF A 56', 'OF A 56 SARL', '56110000000001', 'of-a-56', 'contact@of-a-56.test'),
  ('00560b00-0000-0000-0000-000000000002', 'OF B 56', 'OF B 56 SARL', '56220000000002', 'of-b-56', 'contact@of-b-56.test');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00560050-0000-0000-0000-000000000001', 'admin56a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00560050-0000-0000-0000-000000000001', 'Admin 56 A', 'admin56a@of.test');

INSERT INTO app.members (id, organization_id, user_id, role, is_default_org) VALUES
  ('00560500-0000-0000-0000-000000000001', '00560a00-0000-0000-0000-000000000001', '00560050-0000-0000-0000-000000000001', 'admin'::app.member_role, true);

-- 1 module dans chaque org
INSERT INTO app.modules (id, organization_id, code, title, default_duration_hours) VALUES
  ('00560d00-0000-0000-0000-00000000000a', '00560a00-0000-0000-0000-000000000001', 'MOD-56-A', 'Module OF A 56', 7.0),
  ('00560d00-0000-0000-0000-00000000000b', '00560b00-0000-0000-0000-000000000002', 'MOD-56-B', 'Module OF B 56', 7.0);

-- 1 resource par module (insérées en service_role : bypass RLS ok)
INSERT INTO app.module_resources (id, organization_id, module_id, title, storage_path, mime_type) VALUES
  ('00560e00-0000-0000-0000-00000000000a', '00560a00-0000-0000-0000-000000000001', '00560d00-0000-0000-0000-00000000000a', 'Support OF A', 'org-a/support.pdf', 'application/pdf'),
  ('00560e00-0000-0000-0000-00000000000b', '00560b00-0000-0000-0000-000000000002', '00560d00-0000-0000-0000-00000000000b', 'Support OF B', 'org-b/support.pdf', 'application/pdf');

-- ----------------------------------------------------------------------------
-- Switch : membre admin d'OF A authentifié
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt(
  '00560a00-0000-0000-0000-000000000001',
  'admin',
  '00560050-0000-0000-0000-000000000001',
  '00560500-0000-0000-0000-000000000001'
);
SELECT tests.as_authenticated();

-- ----------------------------------------------------------------------------
-- TEST 1 : Admin A voit 1 seule resource_module au total (uniquement son org)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.module_resources),
  1,
  'module_resources : admin A ne voit que 1 resource (la sienne, pas celle d''OF B)'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : Admin A ne voit aucune resource de l''org B (cross-tenant)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.module_resources WHERE organization_id = '00560b00-0000-0000-0000-000000000002'::uuid),
  0,
  'module_resources : admin A voit 0 resource d''OF B (isolation cross-tenant)'
);

-- ----------------------------------------------------------------------------
-- TEST 3 : Admin A voit bien sa propre resource (sanity check inverse)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.module_resources WHERE organization_id = '00560a00-0000-0000-0000-000000000001'::uuid),
  1,
  'module_resources : admin A voit 1 resource de son propre org (sanity check)'
);

-- ----------------------------------------------------------------------------
-- Switch : rôle anon (pas de JWT) — simule apprenant sans session
-- ----------------------------------------------------------------------------
SELECT tests.clear_jwt();
SET LOCAL ROLE anon;

-- ----------------------------------------------------------------------------
-- TEST 4 : anon voit 0 resource (aucun accès direct sans JWT)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.module_resources),
  0,
  'module_resources : anon voit 0 resource (aucun accès sans JWT)'
);

SELECT * FROM finish();
ROLLBACK;
