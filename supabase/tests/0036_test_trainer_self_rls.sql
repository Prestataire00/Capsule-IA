-- supabase/tests/0036_test_trainer_self_rls.sql
BEGIN;
SELECT plan(10);

-- Fixtures (cohérentes avec 0029_test_trainer_multi_membership)
-- NB: user 33333333 = utilisateur sans aucune ligne app.trainers, pour valider
-- que le policy self ne fuit rien à un user non-formateur (email distinct des trainers).
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'formateur@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'autre@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'sans-trainer@example.com');
INSERT INTO app.organizations (id, name, slug) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Alpha', 'of-alpha');
INSERT INTO app.trainers (id, organization_id, first_name, last_name, email)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Martin', 'formateur@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bob', 'Dupont', 'autre@example.com');

INSERT INTO app.trainer_competencies (organization_id, trainer_id, kind, title)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'diploma', 'Master MEEF'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'dddddddd-dddd-dddd-dddd-dddddddddddd', 'diploma', 'Bac+2 RH');

-- Formateur Alice (auth.uid() = 11111111...)
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();

-- SELECT self trainers
SELECT is(
  (SELECT count(*) FROM app.trainers WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')::int,
  1,
  'Alice voit sa propre fiche trainer'
);
SELECT is(
  (SELECT count(*) FROM app.trainers WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')::int,
  0,
  'Alice ne voit pas la fiche de Bob (même OF) — policy self uniquement'
);

-- SELECT self competencies
SELECT is(
  (SELECT count(*) FROM app.trainer_competencies
   WHERE trainer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc')::int,
  1,
  'Alice voit ses propres compétences'
);
SELECT is(
  (SELECT count(*) FROM app.trainer_competencies
   WHERE trainer_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')::int,
  0,
  'Alice ne voit pas les compétences de Bob'
);

-- INSERT self competency
SELECT lives_ok(
  $$ INSERT INTO app.trainer_competencies (organization_id, trainer_id, kind, title)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'cccccccc-cccc-cccc-cccc-cccccccccccc', 'certification', 'TOEIC 950') $$,
  'Alice peut INSERT une compétence sur sa fiche'
);

-- INSERT competency d'un autre trainer (Bob) — refusé par WITH CHECK
SELECT throws_ok(
  $$ INSERT INTO app.trainer_competencies (organization_id, trainer_id, kind, title)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'dddddddd-dddd-dddd-dddd-dddddddddddd', 'certification', 'Spoof') $$,
  '42501',
  NULL,
  'Alice ne peut pas INSERT une compétence sur la fiche de Bob (RLS WITH CHECK)'
);

-- UPDATE bio self : OK
SELECT lives_ok(
  $$ UPDATE app.trainers SET bio = 'Hello' WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' $$,
  'Alice peut UPDATE sa bio'
);

-- UPDATE bio d'un autre : 0 rows (policy USING)
SELECT is(
  (SELECT count(*) FROM (
    UPDATE app.trainers SET bio = 'Spoof' WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' RETURNING 1
  ) s)::int,
  0,
  'Alice update sur fiche de Bob = 0 rows (RLS USING filtre)'
);

-- DELETE self competencies (Master MEEF + TOEIC 950 = 2 rows)
SELECT is(
  (SELECT count(*) FROM (
    DELETE FROM app.trainer_competencies WHERE trainer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' RETURNING 1
  ) s)::int,
  2,
  'Alice peut DELETE ses propres compétences (master + certif TOEIC)'
);

-- User sans aucune ligne app.trainers — 0 rows visibles via policy self
-- (user 33333333 a un email qui ne matche aucun trainer, donc autolink n'a rien fait)
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '33333333-3333-3333-3333-333333333333'::uuid
);
SELECT tests.as_authenticated();
SELECT is(
  (SELECT count(*) FROM app.trainers)::int,
  0,
  'User sans ligne trainer voit 0 trainers via policy self'
);

SELECT * FROM finish();
ROLLBACK;
