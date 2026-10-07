-- ============================================================================
-- Tests pgTAP : fils directs de l'espace entreprise (0221).
-- ============================================================================
BEGIN;
SELECT plan(3);

INSERT INTO app.organizations (id, name, slug, contact_email, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'OF A', 'of-a-221', 'contact@of-a-221.test', 'OF A SARL', '22122122122122');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa221', 'laurie221@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb221', 'faouzi221@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa221', 'gestionnaire'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb221', 'owner'::app.member_role, true);
INSERT INTO app.companies (id, organization_id, name) VALUES
  ('c0c0c0c0-0000-0000-0000-000000000221', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'Client A');
INSERT INTO app.contacts (id, organization_id, company_id, first_name, last_name, email) VALUES
  ('c1c1c1c1-0000-0000-0000-000000000221', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'c0c0c0c0-0000-0000-0000-000000000221', 'Rita', 'Ref', 'rita221@client.test');

SET LOCAL ROLE service_role;
INSERT INTO app.espace_entreprise_messages (organization_id, contact_id, auteur, auteur_nom, body, interlocuteur_user_id) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'c1c1c1c1-0000-0000-0000-000000000221', 'entreprise', 'Rita', 'À toute l’équipe', NULL),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221', 'c1c1c1c1-0000-0000-0000-000000000221', 'entreprise', 'Rita', 'Pour Laurie seulement', 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa221');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaa221","organization_id":"00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221","user_role":"gestionnaire","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app.espace_entreprise_messages)::int, 2, 'Laurie lit le fil général et son fil direct');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbb221","organization_id":"00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa221","user_role":"owner","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM app.espace_entreprise_messages)::int, 1, 'Faouzi, même propriétaire, ne lit pas le fil direct de Laurie');
SELECT is((SELECT body FROM app.espace_entreprise_messages), 'À toute l’équipe', 'il lit le fil général');

SELECT * FROM finish();
ROLLBACK;
