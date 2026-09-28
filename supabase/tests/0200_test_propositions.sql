-- ============================================================================
-- Tests pgTAP : propositions commerciales (0200).
-- ============================================================================
BEGIN;
SELECT plan(7);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.propositions'::regclass), 'RLS activée');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.propositions'::regclass), 'RLS forcée');
SELECT policies_are('app', 'propositions', ARRAY['propositions_select', 'propositions_write'], 'policies des propositions');
SELECT col_is_unique('app', 'propositions', ARRAY['prospect_id', 'version'], 'une version n''existe qu''une fois');
SELECT has_index('app', 'propositions', 'ux_propositions_une_active', 'une seule proposition active par demande');

SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.propositions (organization_id, prospect_id, version, contenu, programme_path)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, gen_random_uuid(), 1, '{}'::jsonb, 'x.pdf')$$,
  '42501', NULL, 'pas d''écriture directe en base');

SELECT is((SELECT count(*)::int FROM app.propositions), 0, 'un formateur ne lit aucune proposition');

SELECT * FROM finish();
ROLLBACK;
