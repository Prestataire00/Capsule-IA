-- ============================================================================
-- Tests pgTAP : app.v_org_kpis n'expose que l'organisation du JWT
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
  ('00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- Apprenant + formation minimale par org (formations NOT NULL : code/title/slug/default_duration_hours)
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea-a@of.test'),
  ('1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Leo', 'B', 'leo-b@of.test');

INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('f0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'F-A', 'Formation A', 'formation-a', 14),
  ('f0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'F-B', 'Formation B', 'formation-b', 14);

-- Un dossier "active" par org (dossiers NOT NULL sans default : reference, learner_id,
-- formation_id, formation_snapshot, modality, start_date, end_date, total_hours)
INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours, total_amount_cents
)
SELECT
  'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A',
  '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, '{}'::jsonb,
  'active'::app.dossier_status, 'presentiel'::app.training_modality,
  current_date, current_date + 7, 14, 120000
FROM app.formations f
WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
LIMIT 1;

INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours, total_amount_cents
)
SELECT
  'd0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'DOS-B',
  '1eb00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', f.id, '{}'::jsonb,
  'active'::app.dossier_status, 'presentiel'::app.training_modality,
  current_date, current_date + 7, 14, 999000
FROM app.formations f
WHERE f.organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
LIMIT 1;

-- Org A authentifiée
SELECT tests.as_authenticated();
SELECT tests.set_jwt(
  '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner',
  '00ee0a00-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

SELECT is(
  (SELECT count(*)::int FROM app.v_org_kpis),
  1,
  'Org A ne voit qu''une seule ligne KPI (la sienne) via la vue'
);

SELECT is(
  (SELECT dossiers_active::int FROM app.v_org_kpis
     WHERE organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'Org A : dossiers_active = 1'
);

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
