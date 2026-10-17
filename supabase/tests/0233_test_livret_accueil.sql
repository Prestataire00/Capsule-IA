BEGIN;
SELECT plan(3);

SELECT has_column('app', 'organizations', 'livret_accueil_path', 'le livret d’accueil de l’organisme');

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-00000000d233', 'Livret test', 'livret-test-0233', 'd233@test.fr');

SELECT lives_ok(
  $$UPDATE app.organizations SET livret_accueil_path = '00000000-0000-0000-0000-00000000d233/livret-accueil.pdf' WHERE id = '00000000-0000-0000-0000-00000000d233'$$,
  'un livret rangé sous l’organisme passe'
);
SELECT throws_ok(
  $$UPDATE app.organizations SET livret_accueil_path = 'autre/livret.exe' WHERE id = '00000000-0000-0000-0000-00000000d233'$$,
  '23514', NULL,
  'un chemin quelconque est refusé'
);

SELECT * FROM finish();
ROLLBACK;
