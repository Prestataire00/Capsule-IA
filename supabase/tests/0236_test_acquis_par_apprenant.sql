BEGIN;
SELECT plan(4);

CREATE TEMP TABLE d236 AS SELECT id FROM app.dossiers WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

SELECT has_column('app', 'dossiers', 'acquis_par_apprenant', 'les acquis par apprenant');
SELECT lives_ok(
  $$UPDATE app.dossiers SET acquis_par_apprenant = '{"00000000-0000-0000-0000-000000000001": {"Créer un TCD": "en_cours"}}' WHERE id = (SELECT id FROM d236)$$,
  'un niveau par objectif et par apprenant'
);
SELECT throws_ok(
  $$UPDATE app.dossiers SET acquis_par_apprenant = '{"00000000-0000-0000-0000-000000000001": {"Créer un TCD": "bof"}}' WHERE id = (SELECT id FROM d236)$$,
  '23514', NULL,
  'un niveau inconnu est refusé'
);
SELECT throws_ok(
  $$UPDATE app.dossiers SET acquis_par_apprenant = '{"00000000-0000-0000-0000-000000000001": "acquis"}' WHERE id = (SELECT id FROM d236)$$,
  '23514', NULL,
  'chaque apprenant porte un objet'
);

SELECT * FROM finish();
ROLLBACK;
