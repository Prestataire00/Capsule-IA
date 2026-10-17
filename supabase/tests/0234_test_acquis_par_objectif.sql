BEGIN;
SELECT plan(3);

CREATE TEMP TABLE d234 AS SELECT id FROM app.dossiers WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;

SELECT has_column('app', 'dossiers', 'acquis_objectifs', 'les acquis par objectif');
SELECT lives_ok(
  $$UPDATE app.dossiers SET acquis_objectifs = '{"Créer un tableau croisé": "en_cours", "Automatiser une tâche": "non_acquis"}' WHERE id = (SELECT id FROM d234)$$,
  'trois niveaux permis'
);
SELECT throws_ok(
  $$UPDATE app.dossiers SET acquis_objectifs = '{"Créer un tableau croisé": "peut-être"}' WHERE id = (SELECT id FROM d234)$$,
  '23514', NULL,
  'un niveau inconnu est refusé'
);

SELECT * FROM finish();
ROLLBACK;
