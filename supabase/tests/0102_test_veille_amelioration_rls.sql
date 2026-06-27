-- ============================================================================
-- Tests pgTAP : RLS veille_entries + improvement_actions (isolation cross-tenant)
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('owner-0b0-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test'),
  ('owner-0b0-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Owner B', 'b@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner-0b0-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner'::app.member_role, true);

-- Données de l'org A (service role bypasse RLS)
INSERT INTO app.veille_entries (organization_id, category, title)
  VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'legale', 'RGPD maj');
INSERT INTO app.improvement_actions (organization_id, origin, title)
  VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'audit', 'Revue process');

-- Owner A : voit la veille de A
SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM app.veille_entries),
  1, 'Owner A voit la veille de son org');

-- Owner B : ne voit pas la veille de A (isolation cross-tenant)
SELECT tests.set_jwt('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'owner-0b0-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT is(
  (SELECT count(*)::int FROM app.veille_entries),
  0, 'Owner B ne voit pas la veille de A');
SELECT is(
  (SELECT count(*)::int FROM app.improvement_actions),
  0, 'Owner B ne voit pas les actions de A');

SELECT * FROM finish();
ROLLBACK;
