-- ============================================================================
-- Tests pgTAP : échanges de l'espace entreprise (0218).
-- ============================================================================
BEGIN;
SELECT plan(6);

INSERT INTO app.organizations (id, name, slug, contact_email, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'OF A', 'of-a-218', 'contact@of-a-218.test', 'OF A SARL', '21821821821821'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbb218', 'OF B', 'of-b-218', 'contact@of-b-218.test', 'OF B SARL', '21821821821822');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa218', 'a218@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb218', 'b218@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa218', 'gestionnaire'::app.member_role, true),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbb218', 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb218', 'admin'::app.member_role, true);
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('c0c0c0c0-0000-0000-0000-000000000218', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'Client A');
INSERT INTO app.contacts (id, organization_id, company_id, first_name, last_name, email) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000218', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'c0c0c0c0-0000-0000-0000-000000000218', 'Rita', 'Ref', 'rita@client.test');

SET LOCAL ROLE service_role;
INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'c1c1c1c1-0000-0000-0000-000000000218', 'entreprise', 'Rita Ref', 'Bonjour');
SELECT throws_ok(
  $$INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body)
    VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'c1c1c1c1-0000-0000-0000-000000000218', 'entreprise', 'Rita', '  ')$$,
  '23514', NULL, 'un message vide est refusé');
SELECT throws_ok(
  $$INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body)
    VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'c1c1c1c1-0000-0000-0000-000000000218', 'pirate', 'X', 'x')$$,
  '23514', NULL, 'auteur inconnu refusé');

-- L'équipe de l'organisme lit ; elle n'écrit pas directement.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa218","organization_id":"00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218","user_role":"gestionnaire","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app.espace_entreprise_messages)::int, 1, 'l’équipe lit les échanges de ses clients');
SELECT throws_ok(
  $$INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body)
    VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa218', 'c1c1c1c1-0000-0000-0000-000000000218', 'organisme', 'A', 'x')$$,
  '42501', NULL, 'aucune écriture depuis le client');

-- Un autre organisme ne voit rien.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb218","organization_id":"00bbb000-bbbb-bbbb-bbbb-bbbbbbbbb218","user_role":"admin","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app.espace_entreprise_messages)::int, 0, 'un autre organisme ne voit pas ces échanges');

RESET ROLE;
SELECT tests.clear_jwt();
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM app.espace_entreprise_messages$$, '42501', NULL, 'un visiteur anonyme ne lit rien');

SELECT * FROM finish();
ROLLBACK;
