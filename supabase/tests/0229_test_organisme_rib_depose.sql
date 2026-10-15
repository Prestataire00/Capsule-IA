BEGIN;
SELECT plan(4);

SELECT has_column('app', 'organizations', 'rib_path', 'le RIB déposé de l’organisme');
SELECT ok(
  (SELECT 'application/pdf' = ANY (allowed_mime_types) FROM storage.buckets WHERE id = 'org_assets'),
  'le bucket org_assets accepte un RIB en PDF'
);

INSERT INTO app.organizations (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-00000000c229', 'Rib test', 'rib-test-0229', 'c229@test.fr');

SELECT lives_ok(
  $$UPDATE app.organizations SET rib_path = '00000000-0000-0000-0000-00000000c229/rib.pdf' WHERE id = '00000000-0000-0000-0000-00000000c229'$$,
  'un chemin de RIB rangé sous l’organisme passe'
);
SELECT throws_ok(
  $$UPDATE app.organizations SET rib_path = '../autre/rib.exe' WHERE id = '00000000-0000-0000-0000-00000000c229'$$,
  '23514', NULL,
  'un chemin quelconque est refusé'
);

SELECT * FROM finish();
ROLLBACK;
