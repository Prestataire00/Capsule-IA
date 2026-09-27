-- ============================================================================
-- Tests pgTAP : une adresse e-mail peut servir à plusieurs stagiaires (0199).
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT hasnt_index('app', 'learners', 'ux_learners_org_email', 'plus d''unicité sur (organisme, adresse)');
SELECT has_index('app', 'learners', 'ix_learners_org_email', 'la recherche par adresse reste indexée');

SELECT tests.as_service_role();
INSERT INTO app.organizations (id, name, slug, contact_email)
  VALUES ('00000000-0000-0000-0000-0000000019a9', 'Test 0199', 'test-0199', 'contact@acme.test')
  ON CONFLICT DO NOTHING;
INSERT INTO app.learners (organization_id, first_name, last_name, email)
  VALUES ('00000000-0000-0000-0000-0000000019a9', 'Marie', 'Dupont', 'rh@acme.test');

SELECT lives_ok(
  $$INSERT INTO app.learners (organization_id, first_name, last_name, email)
    VALUES ('00000000-0000-0000-0000-0000000019a9', 'Jean', 'Martin', 'rh@acme.test')$$,
  'deux salariés sous la boîte RH de leur entreprise');

SELECT * FROM finish();
ROLLBACK;
