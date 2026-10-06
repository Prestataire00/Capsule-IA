-- ============================================================================
-- Tests pgTAP : replays tl;dv / Lexi / Meet (0215).
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT has_column('app', 'session_recordings', 'title', 'un replay peut avoir un libellé');
SELECT throws_ok(
  $$INSERT INTO app.session_recordings (organization_id, session_id, source, play_url)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'youtube', 'https://x')$$,
  '23514', NULL, 'source inconnue refusée');
SELECT throws_ok(
  $$INSERT INTO app.session_recordings (organization_id, session_id, source, play_url)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'tldv', 'javascript:alert(1)')$$,
  '23514', NULL, 'seule une adresse web est acceptée');

SELECT * FROM finish();
ROLLBACK;
