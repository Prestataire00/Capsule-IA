-- ============================================================================
-- Tests pgTAP : validation du cours et boîte formateur de l'organisme (0203).
-- ============================================================================
BEGIN;
SELECT plan(12);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.course_validation_recipients'::regclass), 'RLS activée (validation)');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.course_validation_recipients'::regclass), 'RLS forcée (validation)');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.organization_google_calendar'::regclass), 'RLS activée (agenda)');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.organization_google_calendar'::regclass), 'RLS forcée (agenda)');

SELECT policies_are('app', 'course_validation_recipients',
  ARRAY['course_validation_recipients_read', 'course_validation_recipients_write'], 'policies de la validation');
SELECT policies_are('app', 'organization_google_calendar',
  ARRAY['organization_google_calendar_read', 'organization_google_calendar_write'], 'policies de l''agenda');

SELECT col_is_pk('app', 'course_validation_recipients', ARRAY['organization_id', 'user_id'],
  'une personne a un seul rôle dans la validation');
SELECT col_is_pk('app', 'organization_google_calendar', 'organization_id', 'un agenda par organisme');

-- Un formateur connecté ne se désigne pas validateur, et ne lit pas le jeton.
SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.course_validation_recipients (organization_id, user_id, role)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-0000000000f1'::uuid, 'validateur')$$,
  '42501', NULL, 'pas de désignation directe en base');

SELECT throws_ok(
  $$INSERT INTO app.organization_google_calendar (organization_id, config_encrypted, config_nonce, config_key_id)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, '\x00', '\x00', 'k')$$,
  '42501', NULL, 'pas de connexion d''agenda directe en base');

SELECT is((SELECT count(*)::int FROM app.organization_google_calendar), 0,
  'un formateur ne lit pas l''agenda de l''organisme');

SELECT is((SELECT count(*)::int FROM app.course_validation_recipients), 0,
  'un formateur ne lit pas la liste des validateurs');

SELECT * FROM finish();
ROLLBACK;
