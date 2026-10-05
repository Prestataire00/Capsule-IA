-- ============================================================================
-- Tests pgTAP : discussion d'équipe d'une séance sans dossier (0210).
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT has_column('app', 'dossier_team_messages', 'session_id', 'un message peut viser une séance');
SELECT has_column('app', 'dossier_team_messages', 'fil_id', 'le fil d''un message, dossier ou séance');

SELECT throws_ok(
  $$INSERT INTO app.dossier_team_messages (organization_id, author_name, body, mentions)
    VALUES (gen_random_uuid(), 'x', 'x', ARRAY[gen_random_uuid()])$$,
  '23514', NULL, 'un message appartient à un fil');

SELECT throws_ok(
  $$INSERT INTO app.dossier_team_messages (organization_id, dossier_id, session_id, author_name, body, mentions)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x', 'x', ARRAY[gen_random_uuid()])$$,
  '23514', NULL, 'jamais à la fois un dossier et une séance');

SELECT policies_are('app', 'dossier_team_messages',
  ARRAY['dossier_team_messages_read', 'dossier_team_messages_write'], 'policies des messages inchangées');

SELECT * FROM finish();
ROLLBACK;
