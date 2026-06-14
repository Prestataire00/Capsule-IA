BEGIN;
SELECT plan(3);
\i supabase/tests/_helpers.sql

SELECT tests.create_test_org('11111111-1111-1111-1111-111111111111', 'Org A');
SELECT tests.create_test_org('22222222-2222-2222-2222-222222222222', 'Org B');

INSERT INTO app.org_legal_documents (organization_id, kind, status, content_md)
VALUES ('11111111-1111-1111-1111-111111111111', 'reglement_interieur', 'draft', 'RI...');

-- 1) Insert OK.
SELECT is(
  (SELECT count(*)::int FROM app.org_legal_documents
   WHERE organization_id='11111111-1111-1111-1111-111111111111'),
  1, 'doc créé');

-- 2) Transition draft -> validated.
UPDATE app.org_legal_documents SET status='validated', validated_at=now()
WHERE organization_id='11111111-1111-1111-1111-111111111111' AND kind='reglement_interieur';
SELECT is(
  (SELECT status FROM app.org_legal_documents
   WHERE organization_id='11111111-1111-1111-1111-111111111111' AND kind='reglement_interieur'),
  'validated', 'transition draft->validated');

-- 3) RLS : org B ne voit pas les docs de org A.
SELECT tests.authenticate_as('22222222-2222-2222-2222-222222222222');
SELECT is(
  (SELECT count(*)::int FROM app.org_legal_documents
   WHERE organization_id='11111111-1111-1111-1111-111111111111'),
  0, 'RLS : org B ne voit pas org A');

SELECT * FROM finish();
ROLLBACK;
