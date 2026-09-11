-- ============================================================================
-- Tests pgTAP : justificatifs d'absence — RLS forcée, lecture seule, pas
-- d'écriture directe par un membre (dépôt en service role après garde).
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'app.attendance_justifications'::regclass),
  'RLS activée sur les justificatifs');
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.attendance_justifications'::regclass),
  'RLS forcée sur les justificatifs');
SELECT policies_are('app', 'attendance_justifications', ARRAY['attendance_justifications_select'],
  'une seule policy, en lecture');
SELECT ok(
  (SELECT NOT public FROM storage.buckets WHERE id = 'attendance-justifications'),
  'le seau des justificatifs est privé');

SELECT tests.as_authenticated();
SELECT throws_ok(
  $$INSERT INTO app.attendance_justifications
      (organization_id, attendance_sheet_id, learner_id, storage_path, file_name, mime_type, size_bytes, submitted_via)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x/y.pdf', 'y.pdf', 'application/pdf', 10, 'apprenant')$$,
  '42501', NULL,
  'un membre connecté ne dépose pas directement un justificatif');

SELECT * FROM finish();
ROLLBACK;
