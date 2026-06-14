-- ============================================================================
-- Tests pgTAP : index d'idempotence (organization_id, file_hash) sur documents
-- ============================================================================
BEGIN;
SELECT plan(2);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, status) VALUES
  ('d0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft');

-- 1er insert d'un document avec un hash donné : OK
INSERT INTO app.documents (organization_id, dossier_id, kind, title, status, storage_path, mime_type, file_hash, generated_at)
VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'convention', 'Convention', 'ready', 'documents/x.pdf', 'application/pdf', 'HASH123', now());
SELECT is(
  (SELECT count(*)::int FROM app.documents WHERE file_hash = 'HASH123'),
  1, 'Premier document inséré');

-- 2e insert même (org, hash) : violation d'unicité
SELECT throws_ok(
  $$ INSERT INTO app.documents (organization_id, dossier_id, kind, title, status, storage_path, mime_type, file_hash, generated_at)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'convention', 'Convention', 'ready', 'documents/y.pdf', 'application/pdf', 'HASH123', now()) $$,
  '23505',
  NULL,
  'Un doublon (org, file_hash) est rejeté par l''index unique');

SELECT * FROM finish();
ROLLBACK;
