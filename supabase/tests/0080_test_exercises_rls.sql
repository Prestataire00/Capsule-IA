-- ============================================================================
-- Tests pgTAP : RLS isolation tenant sur app.exercises + app.exercise_submissions
-- ============================================================================
-- Couverture :
--   1. Un membre staff d'OF A ne voit QUE les exercises de son org (1, pas ceux d'OF B).
--   2. Un membre staff d'OF A ne voit AUCUN exercise d'OF B (cross-tenant).
--   3. Un membre staff d'OF A voit bien ses exercise_submissions (1, pas celles d'OF B).
--   4. Un membre staff d'OF A ne voit AUCUNE exercise_submission d'OF B.
--   5. INSERT dans exercise_submissions en authenticated ÉCHOUE (aucune policy INSERT).
--   6. Un rôle anon (pas de JWT) ne voit AUCUN exercise.
-- ============================================================================

BEGIN;
SELECT plan(6);

-- ----------------------------------------------------------------------------
-- Setup : service_role — 2 orgs + users/members
--         Chaîne FK : org → learner + formation → dossier → exercise → submission
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

-- 2 organisations
INSERT INTO app.organizations (id, name, legal_name, siret, slug, contact_email) VALUES
  ('00690a00-0000-0000-0000-000000000001', 'OF A 69', 'OF A 69 SARL', '69110000000001', 'of-a-69', 'contact@of-a-69.test'),
  ('00690b00-0000-0000-0000-000000000002', 'OF B 69', 'OF B 69 SARL', '69220000000002', 'of-b-69', 'contact@of-b-69.test');

-- 1 utilisateur membre staff d'OF A
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00690050-0000-0000-0000-000000000001', 'admin69a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00690050-0000-0000-0000-000000000001', 'Admin 69 A', 'admin69a@of.test');

INSERT INTO app.members (id, organization_id, user_id, role, is_default_org) VALUES
  ('00690500-0000-0000-0000-000000000001', '00690a00-0000-0000-0000-000000000001', '00690050-0000-0000-0000-000000000001', 'admin'::app.member_role, true);

-- 1 apprenant par org (requis par dossier.learner_id NOT NULL et exercise_submissions.learner_id NOT NULL)
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('00690c00-0000-0000-0000-000000000001', '00690a00-0000-0000-0000-000000000001', 'Jean', 'Dupont', 'jean.dupont@of-a-69.test'),
  ('00690c00-0000-0000-0000-000000000002', '00690b00-0000-0000-0000-000000000002', 'Marie', 'Martin', 'marie.martin@of-b-69.test');

-- 1 formation par org (requis par dossier.formation_id NOT NULL)
-- Colonnes NOT NULL sans défaut : organization_id, code, title, slug, default_duration_hours, default_price_cents
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours, default_price_cents) VALUES
  ('00690d00-0000-0000-0000-000000000001', '00690a00-0000-0000-0000-000000000001', 'FORM-69-A', 'Formation OF A 69', 'formation-of-a-69', 7.0, 0),
  ('00690d00-0000-0000-0000-000000000002', '00690b00-0000-0000-0000-000000000002', 'FORM-69-B', 'Formation OF B 69', 'formation-of-b-69', 7.0, 0);

-- 1 dossier par org (requis par exercises.dossier_id NOT NULL)
-- Colonnes NOT NULL sans défaut : organization_id, reference, learner_id, formation_id,
-- formation_snapshot, modality, start_date, end_date, total_hours
INSERT INTO app.dossiers (
  id, organization_id, reference,
  learner_id, formation_id, formation_snapshot,
  modality, start_date, end_date, total_hours
) VALUES
  (
    '00690e00-0000-0000-0000-000000000001',
    '00690a00-0000-0000-0000-000000000001',
    'DOS-69-A-001',
    '00690c00-0000-0000-0000-000000000001',
    '00690d00-0000-0000-0000-000000000001',
    '{"title": "Formation OF A 69"}'::jsonb,
    'presentiel'::app.training_modality,
    '2026-01-10', '2026-01-17', 7.0
  ),
  (
    '00690e00-0000-0000-0000-000000000002',
    '00690b00-0000-0000-0000-000000000002',
    'DOS-69-B-001',
    '00690c00-0000-0000-0000-000000000002',
    '00690d00-0000-0000-0000-000000000002',
    '{"title": "Formation OF B 69"}'::jsonb,
    'presentiel'::app.training_modality,
    '2026-01-10', '2026-01-17', 7.0
  );

-- 1 exercise par org (inséré en service_role : bypass RLS ok)
INSERT INTO app.exercises (id, organization_id, dossier_id, title) VALUES
  ('00690f00-0000-0000-0000-000000000001', '00690a00-0000-0000-0000-000000000001', '00690e00-0000-0000-0000-000000000001', 'Exercice OF A'),
  ('00690f00-0000-0000-0000-000000000002', '00690b00-0000-0000-0000-000000000002', '00690e00-0000-0000-0000-000000000002', 'Exercice OF B');

-- 1 exercise_submission pour l'org A uniquement (inséré en service_role)
-- La soumission exige content IS NOT NULL OR file_path IS NOT NULL
INSERT INTO app.exercise_submissions (id, organization_id, exercise_id, learner_id, content) VALUES
  ('00691000-0000-0000-0000-000000000001', '00690a00-0000-0000-0000-000000000001', '00690f00-0000-0000-0000-000000000001', '00690c00-0000-0000-0000-000000000001', 'Voici ma réponse à l''exercice.');

-- ----------------------------------------------------------------------------
-- Switch : membre admin d'OF A authentifié
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt(
  '00690a00-0000-0000-0000-000000000001',
  'admin',
  '00690050-0000-0000-0000-000000000001',
  '00690500-0000-0000-0000-000000000001'
);
SELECT tests.as_authenticated();

-- ----------------------------------------------------------------------------
-- TEST 1 : Admin A voit 1 seul exercise au total (uniquement son org)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.exercises),
  1,
  'exercises : admin A ne voit que 1 exercise (le sien, pas celui d''OF B)'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : Admin A ne voit aucun exercise d''org B (cross-tenant)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.exercises WHERE organization_id = '00690b00-0000-0000-0000-000000000002'::uuid),
  0,
  'exercises : admin A voit 0 exercise d''OF B (isolation cross-tenant)'
);

-- ----------------------------------------------------------------------------
-- TEST 3 : Admin A voit 1 exercise_submission (la sienne, pas celles d''OF B)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.exercise_submissions),
  1,
  'exercise_submissions : admin A voit 1 submission (la sienne, pas celles d''OF B)'
);

-- ----------------------------------------------------------------------------
-- TEST 4 : Admin A ne voit aucune exercise_submission d''org B (cross-tenant)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.exercise_submissions WHERE organization_id = '00690b00-0000-0000-0000-000000000002'::uuid),
  0,
  'exercise_submissions : admin A voit 0 submission d''OF B (isolation cross-tenant)'
);

-- ----------------------------------------------------------------------------
-- TEST 5 : INSERT dans exercise_submissions en authenticated ÉCHOUE
-- Aucune policy INSERT définie → FORCE RLS → deny-by-default → 42501
-- (L''écriture est réservée au service_role / routes serveur : validations métier
--  et audit trail garantis côté serveur, pas de soumission directe client)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO app.exercise_submissions
       (organization_id, exercise_id, learner_id, content)
     VALUES
       ('00690a00-0000-0000-0000-000000000001'::uuid,
        '00690f00-0000-0000-0000-000000000001'::uuid,
        '00690c00-0000-0000-0000-000000000001'::uuid,
        'Tentative de soumission directe depuis le client') $$,
  '42501',
  NULL,
  'exercise_submissions : membre authentifié ne peut PAS INSERT (aucune policy INSERT, FORCE RLS)'
);

-- ----------------------------------------------------------------------------
-- Switch : rôle anon (pas de JWT) — simule accès sans session
-- ----------------------------------------------------------------------------
SELECT tests.clear_jwt();
SET LOCAL ROLE anon;

-- ----------------------------------------------------------------------------
-- TEST 6 : anon voit 0 exercise (aucun accès sans JWT)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.exercises),
  0,
  'exercises : anon voit 0 exercise (aucun accès sans JWT)'
);

SELECT * FROM finish();
ROLLBACK;
