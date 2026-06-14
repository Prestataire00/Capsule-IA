-- ============================================================================
-- Tests pgTAP : app.attendance_consolidated n'expose que l'organisation du JWT
-- ============================================================================
BEGIN;
SELECT plan(2);

SELECT tests.as_service_role();

-- Deux orgs
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

-- Un user owner de l'org A
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- Données minimales pour 1 feuille par org (company -> dossier -> session -> sheet)
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('c0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Client A'),
  ('c0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Client B');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea-a@of.test'),
  ('1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Leo', 'B', 'leo-b@of.test');

INSERT INTO app.dossiers (id, organization_id, reference, learner_id, company_id, status) VALUES
  ('d0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft'),
  ('d0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DOS-B', '1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'draft');

INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at) VALUES
  ('5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'distanciel', now() - interval '2 days', now() - interval '2 days' + interval '3 hours'),
  ('5e500b00-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'distanciel', now() - interval '2 days', now() - interval '2 days' + interval '3 hours');

INSERT INTO app.attendance_sheets (id, organization_id, dossier_id, session_id, half_day, status) VALUES
  ('a5a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5e500a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'full', 'open'),
  ('a5b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '5e500b00-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'full', 'open');

-- Org A authentifiée
SELECT tests.as_authenticated();
SELECT tests.set_jwt(
  '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner',
  'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

SELECT is(
  (SELECT count(*)::int FROM app.attendance_consolidated),
  1,
  'Org A ne voit que sa propre feuille via la vue'
);

SELECT is(
  (SELECT count(*)::int FROM app.attendance_consolidated
     WHERE organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'Org A ne voit jamais les feuilles de l''org B'
);

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
