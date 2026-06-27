-- ============================================================================
-- Tests pgTAP : RLS — app.prospect_document_reviews + app.prospect_events
-- ============================================================================
BEGIN;
SELECT plan(6);

SELECT tests.as_service_role();

-- 2 OF + users (gestionnaire A, formateur A, gestionnaire B)
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestA@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formA@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gestB@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur'::app.member_role, true),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gestionnaire'::app.member_role, true);

INSERT INTO app.prospects (id, organization_id, first_name, last_name, email, situation, funder_kinds, funder_kind)
VALUES
  ('d05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Jean', 'Test', 'jean@test.fr', 'salarie', ARRAY['opco']::app.funder_kind[], 'opco');

-- Gestionnaire A
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT tests.as_authenticated();

SELECT lives_ok(
  $$ INSERT INTO app.prospect_document_reviews (organization_id, prospect_id, doc_key, status)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'urssaf', 'verified') $$,
  'gestionnaire A : peut INSERT une revue de pièce (is_staff)');

SELECT is(
  (SELECT count(*) FROM app.prospect_document_reviews
   WHERE prospect_id = 'd05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  1, 'gestionnaire A : voit la revue de son org');

SELECT lives_ok(
  $$ INSERT INTO app.prospect_events (organization_id, prospect_id, kind, actor_user_id)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'document_verified', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'gestionnaire A : peut INSERT un événement timeline');

-- Formateur A (non-staff)
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'formateur', 'aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT throws_ok(
  $$ INSERT INTO app.prospect_document_reviews (organization_id, prospect_id, doc_key, status)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kbis', 'verified') $$,
  '42501', NULL, 'formateur : INSERT revue refusé (non-staff)');

-- Gestionnaire B (autre org) : cross-tenant
SELECT tests.set_jwt('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gestionnaire', 'bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT tests.as_authenticated();
SELECT is(
  (SELECT count(*) FROM app.prospect_document_reviews
   WHERE prospect_id = 'd05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  0, 'gestionnaire B : ne voit pas les revues de l''org A (cross-tenant)');

SELECT is(
  (SELECT count(*) FROM app.prospect_events
   WHERE prospect_id = 'd05a0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::int,
  0, 'gestionnaire B : ne voit pas la timeline de l''org A (cross-tenant)');

SELECT * FROM finish();
ROLLBACK;
