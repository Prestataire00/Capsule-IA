-- ============================================================================
-- Tests pgTAP : messages directs (0217) — seuls les participants lisent.
-- ============================================================================
BEGIN;
SELECT plan(9);

INSERT INTO app.organizations (id, name, slug, contact_email, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'OF A', 'of-a-217', 'contact@of-a-217.test', 'OF A SARL', '21721721721721');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217', 'a217@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb217', 'b217@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cccc3333-cccc-cccc-cccc-ccccccccc217', 'c217@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217', 'gestionnaire'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb217', 'admin'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'cccc3333-cccc-cccc-cccc-ccccccccc217', 'owner'::app.member_role, true);

SET LOCAL ROLE service_role;

INSERT INTO app.direct_conversations (id, organization_id, created_by) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000217', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217');
INSERT INTO app.direct_participants (conversation_id, user_id) VALUES
  ('d1d1d1d1-0000-0000-0000-000000000217', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217'),
  ('d1d1d1d1-0000-0000-0000-000000000217', 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb217');
INSERT INTO app.direct_messages (organization_id, conversation_id, author_user_id, author_name, body) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'd1d1d1d1-0000-0000-0000-000000000217', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217', 'A', 'Bonjour');

SELECT throws_ok(
  $$INSERT INTO app.direct_messages (organization_id, conversation_id, author_name, body)
    VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'd1d1d1d1-0000-0000-0000-000000000217', 'A', '   ')$$,
  '23514', NULL, 'un message vide est refusé');

-- A participe : voit la conversation, ses participants et le message.
RESET ROLE;
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'gestionnaire', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app.direct_conversations)::int, 1, 'A voit sa conversation');
SELECT is((SELECT count(*) FROM app.direct_participants)::int, 2, 'A voit les deux participants');
SELECT is((SELECT count(*) FROM app.direct_messages)::int, 1, 'A lit le message');
SELECT throws_ok(
  $$INSERT INTO app.direct_messages (organization_id, conversation_id, author_user_id, author_name, body)
    VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'd1d1d1d1-0000-0000-0000-000000000217', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa217', 'A', 'direct')$$,
  '42501', NULL, 'aucune écriture depuis le client');

-- C est propriétaire de l'organisme mais ne participe pas : il ne lit rien.
RESET ROLE;
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa217', 'owner', 'cccc3333-cccc-cccc-cccc-ccccccccc217');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app.direct_conversations)::int, 0, 'la direction ne voit pas la conversation des autres');
SELECT is((SELECT count(*) FROM app.direct_participants)::int, 0, 'ni ses participants');
SELECT is((SELECT count(*) FROM app.direct_messages)::int, 0, 'ni ses messages');
SELECT throws_ok(
  $$INSERT INTO app.direct_participants (conversation_id, user_id)
    VALUES ('d1d1d1d1-0000-0000-0000-000000000217', 'cccc3333-cccc-cccc-cccc-ccccccccc217')$$,
  '42501', NULL, 'personne ne s''ajoute soi-même à une conversation');

SELECT * FROM finish();
ROLLBACK;
