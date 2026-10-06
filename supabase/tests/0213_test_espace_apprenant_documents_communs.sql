-- ============================================================================
-- Tests pgTAP : l'espace apprenant ne liste que les documents communs (0213).
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT has_function('app', 'get_apprenant_resources', ARRAY['uuid'], 'la fonction existe toujours');
SELECT ok(
  pg_get_functiondef('app.get_apprenant_resources(uuid)'::regprocedure) LIKE '%visible_entreprise%',
  'seuls les documents « Commun à tous » sont listés');
SELECT ok(
  NOT has_function_privilege('authenticated', 'app.get_apprenant_resources(uuid)', 'EXECUTE'),
  'réservée au service role');

SELECT * FROM finish();
ROLLBACK;
