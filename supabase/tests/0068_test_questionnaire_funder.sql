-- ============================================================================
-- Tests pgTAP : questionnaire financeur (CHECK funder + template système lisible)
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();
INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test');
-- Formation minimale pour l'org (colonnes NOT NULL sans default : code, title, slug, default_duration_hours)
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('f0c00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FORM-Q-1', 'Formation Q', 'formation-q', 1);
INSERT INTO app.funders (id, organization_id, kind, name, contact_email) VALUES
  ('f0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'opco'::app.funder_kind, 'OPCO Test', 'opco@test.fr');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status, modality, start_date, end_date, total_hours, formation_snapshot)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-Q', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, 'active', 'presentiel', now()::date, now()::date, 70, '{}'::jsonb
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;

-- 1) Une assignation recipient_kind='funder' est acceptée par le CHECK
SELECT lives_ok(
  $$ INSERT INTO app.questionnaire_assignments (organization_id, template_id, dossier_id, recipient_kind, recipient_funder_id, recipient_email, token_hash)
     SELECT '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', t.id, 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'funder', 'f0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'opco@test.fr', 'hash-funder-1'
       FROM app.questionnaire_templates t WHERE t.code = 'funder_satisfaction' LIMIT 1 $$,
  'recipient_kind=funder accepté + recipient_funder_id'
);

-- 2) Les 3 templates système financeur existent
SELECT is(
  (SELECT count(*)::int FROM app.questionnaire_templates WHERE code IN ('funder_besoins','funder_satisfaction','funder_conformite') AND organization_id IS NULL),
  3, 'Les 3 templates système financeur sont seedés');

-- 3) Un membre authentifié lit les templates système (organization_id NULL)
SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', '00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM app.questionnaire_templates WHERE code = 'funder_satisfaction'),
  1, 'Template système financeur lisible par un membre');

SELECT * FROM finish();
ROLLBACK;
