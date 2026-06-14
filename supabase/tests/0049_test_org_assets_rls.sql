-- ============================================================================
-- Tests pgTAP : RLS bucket org_assets (isolation cross-tenant + write admin)
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'g@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test'),
  ('gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gest A', 'g@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire'::app.member_role, true);

-- Un objet org_assets appartenant à l'org A
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('org_assets', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa/signature.png', NULL);

-- Owner de A authentifié : voit l'objet de A
SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM storage.objects
     WHERE bucket_id = 'org_assets' AND name LIKE '00aaa000-%'),
  1, 'Owner de A voit l''asset de A');

-- Un membre de B ne voit pas l'asset de A
SELECT tests.clear_jwt();
SELECT tests.set_jwt('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM storage.objects
     WHERE bucket_id = 'org_assets'),
  0, 'Un membre de B ne voit aucun asset de A');

-- Un gestionnaire (non admin/owner) de A ne peut pas INSERT
SELECT tests.clear_jwt();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('org_assets', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa/stamp.png') $$,
  '42501',
  NULL,
  'Un gestionnaire ne peut pas écrire un asset org (admin/owner only)');

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
