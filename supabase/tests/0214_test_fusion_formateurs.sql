-- ============================================================================
-- Tests pgTAP : fusion de deux fiches formateur (0214).
-- ============================================================================
BEGIN;
SELECT plan(4);

SELECT has_function('app', 'fusionner_formateurs', ARRAY['uuid', 'uuid'], 'la fusion existe');
SELECT ok(NOT has_function_privilege('authenticated', 'app.fusionner_formateurs(uuid, uuid)', 'EXECUTE'), 'réservée au service role');

SELECT throws_ok(
  $$SELECT app.fusionner_formateurs('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid)$$,
  '22023', NULL, 'une fiche ne se fusionne pas avec elle-même');

SELECT throws_ok(
  $$SELECT app.fusionner_formateurs(gen_random_uuid(), gen_random_uuid())$$,
  '22023', NULL, 'fiches introuvables : rien ne bouge');

SELECT * FROM finish();
ROLLBACK;
