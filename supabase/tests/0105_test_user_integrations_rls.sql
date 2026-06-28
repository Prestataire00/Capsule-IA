-- ============================================================================
-- Tests pgTAP : RLS — app.user_integrations (par utilisateur)
-- ============================================================================
BEGIN;
SELECT plan(4);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin'::app.member_role, true);

-- Utilisateur A
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();

SELECT lives_ok(
  $$ INSERT INTO app.user_integrations (user_id, organization_id, kind, config_encrypted, config_nonce, config_key_id)
     VALUES ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'google_calendar', '\x00', '\x00', 'k') $$,
  'A : peut INSERT sa propre intégration');

SELECT is(
  (SELECT count(*) FROM app.user_integrations)::int, 1,
  'A : voit sa propre intégration');

-- Utilisateur B
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT tests.as_authenticated();

SELECT is(
  (SELECT count(*) FROM app.user_integrations)::int, 0,
  'B : ne voit pas l''intégration de A (isolation par utilisateur)');

SELECT throws_ok(
  $$ INSERT INTO app.user_integrations (user_id, organization_id, kind, config_encrypted, config_nonce, config_key_id)
     VALUES ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'google_calendar', '\x00', '\x00', 'k') $$,
  '42501', NULL, 'B : ne peut pas INSERT pour le compte de A');

SELECT * FROM finish();
ROLLBACK;
