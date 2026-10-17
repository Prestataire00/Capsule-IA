BEGIN;
SELECT plan(3);

CREATE TEMP TABLE d235 AS SELECT id FROM app.dossiers WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

SELECT has_column('app', 'dossiers', 'resultats', 'le résultat par apprenant');
SELECT lives_ok(
  $$UPDATE app.dossiers SET resultats = '{"00000000-0000-0000-0000-000000000001": "reussite", "00000000-0000-0000-0000-000000000002": "echec"}' WHERE id = (SELECT id FROM d235)$$,
  'réussite et échec permis'
);
SELECT throws_ok(
  $$UPDATE app.dossiers SET resultats = '{"00000000-0000-0000-0000-000000000001": "bof"}' WHERE id = (SELECT id FROM d235)$$,
  '23514', NULL,
  'une autre valeur est refusée'
);

SELECT * FROM finish();
ROLLBACK;
