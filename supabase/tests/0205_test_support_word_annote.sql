-- ============================================================================
-- Tests pgTAP : version Word et version annotée d'un support (0205).
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT has_column('app', 'session_resources', 'word_path', 'conversion Word gardée');
SELECT has_column('app', 'session_resources', 'annotated_path', 'version annotée');
SELECT has_column('app', 'session_resources', 'annotated_at', 'date de la version annotée');
SELECT has_column('app', 'session_resources', 'annotated_by', 'auteur de la version annotée');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.session_resources'::regclass),
  'la RLS des supports reste forcée');

SELECT * FROM finish();
ROLLBACK;
