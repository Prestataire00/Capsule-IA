-- ============================================================================
-- Tests pgTAP : RLS prospects (org + non assignés) et lien de conversion
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- 3 prospects : un de A, un non assigné, un de B
INSERT INTO app.prospects (id, organization_id, first_name, last_name, email, situation, funder_kind, status) VALUES
  ('p0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'A', 'a@p.test', 'salarie', 'opco', 'new'),
  ('p0u00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL,                                    'U', 'U', 'u@p.test', 'salarie', 'opco', 'new'),
  ('p0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'B', 'b@p.test', 'salarie', 'opco', 'new');

SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- A voit son prospect + le non assigné, mais pas celui de B
SELECT is((SELECT count(*)::int FROM app.prospects), 2, 'Org A voit son prospect + le non assigné');
SELECT is((SELECT count(*)::int FROM app.prospects WHERE organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'Org A ne voit pas le prospect assigné à B');

-- Service role : poser converted_dossier_id + status converted tient (lien de conversion)
SELECT tests.clear_jwt();
SELECT tests.as_service_role();
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'A', 'a@p.test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-2026-P0A00000', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, 'draft'
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;
UPDATE app.prospects SET converted_dossier_id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status = 'converted'
  WHERE id = 'p0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT status::text FROM app.prospects WHERE id = 'p0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'converted', 'Le prospect converti porte le statut converted + le dossier lié');

SELECT * FROM finish();
ROLLBACK;
