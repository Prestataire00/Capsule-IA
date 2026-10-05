-- ============================================================================
-- Tests pgTAP : boîte formateur de l'organisme (0203). La table de désignation
-- des validateurs a été retirée par 0206.
-- ============================================================================
BEGIN;
SELECT plan(7);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.organization_google_calendar'::regclass), 'RLS activée (agenda)');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.organization_google_calendar'::regclass), 'RLS forcée (agenda)');

SELECT policies_are('app', 'organization_google_calendar',
  ARRAY['organization_google_calendar_read', 'organization_google_calendar_write'], 'policies de l''agenda');

SELECT col_is_pk('app', 'organization_google_calendar', 'organization_id', 'un agenda par organisme');

SELECT hasnt_table('app', 'course_validation_recipients', 'plus de désignation des validateurs (0206)');

-- Un formateur connecté ne lit ni n'écrit le jeton de l'organisme.
SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.organization_google_calendar (organization_id, config_encrypted, config_nonce, config_key_id)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, '\x00', '\x00', 'k')$$,
  '42501', NULL, 'pas de connexion d''agenda directe en base');

SELECT is((SELECT count(*)::int FROM app.organization_google_calendar), 0,
  'un formateur ne lit pas l''agenda de l''organisme');

SELECT * FROM finish();
ROLLBACK;
