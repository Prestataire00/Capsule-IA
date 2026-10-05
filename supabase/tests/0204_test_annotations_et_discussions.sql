-- ============================================================================
-- Tests pgTAP : annotations des contenus et discussion d'équipe (0204).
-- ============================================================================
BEGIN;
SELECT plan(13);

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'app.content_annotations'::regclass), 'RLS forcée (annotations)');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'app.dossier_team_messages'::regclass), 'RLS forcée (messages)');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'app.dossier_team_reads'::regclass), 'RLS forcée (lectures)');

SELECT policies_are('app', 'content_annotations',
  ARRAY['content_annotations_read', 'content_annotations_write'], 'policies des annotations');
SELECT policies_are('app', 'dossier_team_messages',
  ARRAY['dossier_team_messages_read', 'dossier_team_messages_write'], 'policies des messages');
SELECT policies_are('app', 'dossier_team_reads',
  ARRAY['dossier_team_reads_read', 'dossier_team_reads_write'], 'policies des lectures');

SELECT col_is_pk('app', 'dossier_team_reads', ARRAY['user_id', 'dossier_id'], 'une lecture par personne et par dossier');

-- Un message sans personne mentionnée n'existe pas.
SELECT throws_ok(
  $$INSERT INTO app.dossier_team_messages (organization_id, dossier_id, author_name, body, mentions)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'x', 'bonjour', '{}')$$,
  '23514', NULL, 'au moins une mention par message');

SELECT throws_ok(
  $$INSERT INTO app.content_annotations (organization_id, target_kind, target_id, couleur, commentaire, author_name)
    VALUES (gen_random_uuid(), 'cours', gen_random_uuid(), 'fluo', 'x', 'x')$$,
  '23514', NULL, 'couleur hors palette refusée');

SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.dossier_team_messages (organization_id, dossier_id, author_name, body, mentions)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, gen_random_uuid(), 'x', 'x', ARRAY[gen_random_uuid()])$$,
  '42501', NULL, 'pas d''écriture directe de message');

SELECT throws_ok(
  $$INSERT INTO app.content_annotations (organization_id, target_kind, target_id, couleur, commentaire, author_name)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, 'cours', gen_random_uuid(), 'a_revoir', 'x', 'x')$$,
  '42501', NULL, 'un formateur n''annote pas en base');

SELECT is((SELECT count(*)::int FROM app.content_annotations), 0, 'un formateur ne lit pas les annotations en direct');
SELECT is((SELECT count(*)::int FROM app.dossier_team_messages), 0, 'aucun message hors de ses dossiers');

SELECT * FROM finish();
ROLLBACK;
