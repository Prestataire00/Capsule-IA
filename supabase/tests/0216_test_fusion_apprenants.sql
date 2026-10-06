-- ============================================================================
-- Tests pgTAP : fusion de deux fiches apprenant (0216).
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT has_function('app', 'fusionner_apprenants', ARRAY['uuid', 'uuid'], 'la fusion existe');
SELECT ok(NOT has_function_privilege('authenticated', 'app.fusionner_apprenants(uuid, uuid)', 'EXECUTE'), 'réservée au service role');
SELECT throws_ok(
  $$SELECT app.fusionner_apprenants(gen_random_uuid(), gen_random_uuid())$$,
  '22023', NULL, 'fiches introuvables : rien ne bouge');

SELECT * FROM finish();
ROLLBACK;
