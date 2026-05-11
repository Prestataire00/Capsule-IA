-- supabase/tests/0029_test_trainer_multi_membership.sql
BEGIN;
SELECT plan(12);

-- Fixtures
INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'formateur@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'autre@example.com');

INSERT INTO app.organizations (id, name, slug)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF Alpha', 'of-alpha'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF Beta',  'of-beta');

-- 1) Trigger autolink : INSERT email='formateur@example.com', user_id NULL
INSERT INTO app.trainers (organization_id, first_name, last_name, email)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Martin', 'formateur@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Alice', 'Martin', 'formateur@example.com');

SELECT is(
  (SELECT count(*) FROM app.trainers WHERE email = 'formateur@example.com' AND user_id IS NULL)::int,
  0,
  'autolink trigger lie user_id pour les INSERT avec email matching auth.users'
);

SELECT is(
  (SELECT count(DISTINCT organization_id) FROM app.trainers WHERE user_id = '11111111-1111-1111-1111-111111111111')::int,
  2,
  'Un user a 2 lignes trainers cross-OF'
);

-- 2) Unique (user_id, organization_id) — double INSERT même OF
SELECT throws_ok(
  $$ INSERT INTO app.trainers (organization_id, first_name, last_name, email)
     VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'Bis', 'formateur@example.com') $$,
  '23505',
  NULL,
  'Unique (user_id, organization_id) bloque le doublon dans le même OF'
);

-- 3) RPC list_my_trainer_memberships — auth.uid() = '11111111...'
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();

SELECT is(
  (SELECT count(*) FROM app.list_my_trainer_memberships())::int,
  2,
  'RPC retourne les 2 memberships du user courant'
);

-- 4) RPC link_my_trainer_rows — idempotent
-- Insère une fiche en bypass trigger (simule cas où user_id NULL persiste)
SELECT tests.as_service_role();
INSERT INTO app.trainers (organization_id, first_name, last_name, email, user_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test', 'Late', 'formateur@example.com', NULL);

SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();

SELECT is(
  (SELECT app.link_my_trainer_rows())::int,
  1,
  'link_my_trainer_rows link la fiche orpheline'
);
SELECT is(
  (SELECT app.link_my_trainer_rows())::int,
  0,
  'link_my_trainer_rows est idempotente (2e appel = 0 row affected)'
);

-- 5) Trigger self-edit guard — formateur tente changement is_internal
SELECT throws_ok(
  $$ UPDATE app.trainers SET is_internal = false
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  'forbidden field update by trainer self',
  'Guard trigger bloque UPDATE is_internal par le formateur lui-même'
);

SELECT throws_ok(
  $$ UPDATE app.trainers SET hourly_rate_cents = 9999
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  NULL,
  'Guard trigger bloque UPDATE hourly_rate_cents par le formateur lui-même'
);

SELECT throws_ok(
  $$ UPDATE app.trainers SET email = 'changed@example.com'
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  NULL,
  'Guard trigger bloque UPDATE email par le formateur lui-même'
);

-- 6) Service_role peut tout modifier
SELECT tests.as_service_role();
SELECT lives_ok(
  $$ UPDATE app.trainers SET hourly_rate_cents = 12000
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'service_role peut UPDATE hourly_rate_cents'
);

-- 7) Formateur peut modifier bio
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '11111111-1111-1111-1111-111111111111'::uuid
);
SELECT tests.as_authenticated();
SELECT lives_ok(
  $$ UPDATE app.trainers SET bio = 'Ma bio'
     WHERE user_id = '11111111-1111-1111-1111-111111111111'
       AND organization_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'Formateur peut UPDATE bio (champ non protégé)'
);

-- 8) Empty user (no membership) — RPC retourne 0 rows
SELECT tests.set_jwt(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated',
  '22222222-2222-2222-2222-222222222222'::uuid
);
SELECT tests.as_authenticated();
SELECT is(
  (SELECT count(*) FROM app.list_my_trainer_memberships())::int,
  0,
  'RPC retourne 0 pour un user sans membership'
);

SELECT * FROM finish();
ROLLBACK;
