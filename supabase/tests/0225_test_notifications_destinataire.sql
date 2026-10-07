BEGIN;
SELECT plan(3);

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-0000000225a1', 'Org 0225', 'org-0225', 'o225@test.fr');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00000000-0000-0000-0000-0000000225f1', 'faouzi225@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000225e1', 'laurie225@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00000000-0000-0000-0000-0000000225a1', '00000000-0000-0000-0000-0000000225f1', 'owner'::app.member_role, true),
  ('00000000-0000-0000-0000-0000000225a1', '00000000-0000-0000-0000-0000000225e1', 'gestionnaire'::app.member_role, true);
INSERT INTO app.notifications (organization_id, channel, template_code, subject, recipient_user_id, status) VALUES
  ('00000000-0000-0000-0000-0000000225a1', 'in_app', 't', 'Pour Faouzi', '00000000-0000-0000-0000-0000000225f1', 'sent'),
  ('00000000-0000-0000-0000-0000000225a1', 'in_app', 't', 'Pour Laurie', '00000000-0000-0000-0000-0000000225e1', 'sent'),
  ('00000000-0000-0000-0000-0000000225a1', 'in_app', 't', 'Pour tous', NULL, 'sent');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000225e1', 'role', 'authenticated',
  'user_role', 'gestionnaire', 'organization_id', '00000000-0000-0000-0000-0000000225a1')::text, true);

SELECT results_eq(
  $$SELECT subject FROM app.notifications WHERE organization_id = '00000000-0000-0000-0000-0000000225a1' ORDER BY subject$$,
  ARRAY['Pour Laurie', 'Pour tous'],
  'Laurie voit les siennes et celles de tout le monde'
);
SELECT is_empty(
  $$SELECT 1 FROM app.notifications WHERE subject = 'Pour Faouzi'$$,
  'pas celles adressées à Faouzi'
);

SELECT set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000225f1', 'role', 'authenticated',
  'user_role', 'owner', 'organization_id', '00000000-0000-0000-0000-0000000225a1')::text, true);
SELECT results_eq(
  $$SELECT subject FROM app.notifications WHERE organization_id = '00000000-0000-0000-0000-0000000225a1' ORDER BY subject$$,
  ARRAY['Pour Faouzi', 'Pour tous'],
  'la direction non plus ne lit pas la cloche des autres'
);

SELECT * FROM finish();
ROLLBACK;
