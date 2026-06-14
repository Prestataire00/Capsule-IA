-- ============================================================================
-- Tests pgTAP : garde-fou suppression dossier (convention signée → archivage only)
-- Couvre la migration 0070_dossier_no_delete_signed_convention.
-- ============================================================================
BEGIN;
SELECT plan(6);

SELECT tests.as_service_role();

-- Fixtures : 1 org, 1 apprenant, 1 formation, 2 dossiers (signé / non signé).
INSERT INTO app.organizations (id, slug, name, legal_name, siret, contact_email) VALUES
  ('00ccc000-cccc-cccc-cccc-cccccccccccc', 'of-guard-test', 'OF Guard', 'OF Guard SARL', '33333333333333', 'guard@of.test');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea11111-1111-1111-1111-111111111111', '00ccc000-cccc-cccc-cccc-cccccccccccc', 'Marie', 'Curie', 'marie@of.test');

INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('f0f00000-0000-0000-0000-000000000000', '00ccc000-cccc-cccc-cccc-cccccccccccc', 'F-G', 'Formation Guard', 'formation-guard', 14);

INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours) VALUES
  ('d0551111-1111-1111-1111-111111111111', '00ccc000-cccc-cccc-cccc-cccccccccccc', 'DOS-G-SIGNED',  '1ea11111-1111-1111-1111-111111111111', 'f0f00000-0000-0000-0000-000000000000', '{}'::jsonb, 'presentiel', '2026-09-01', '2026-09-15', 14),
  ('d0552222-2222-2222-2222-222222222222', '00ccc000-cccc-cccc-cccc-cccccccccccc', 'DOS-G-NOSIGN',  '1ea11111-1111-1111-1111-111111111111', 'f0f00000-0000-0000-0000-000000000000', '{}'::jsonb, 'presentiel', '2026-09-01', '2026-09-15', 14);

-- Dossier 1 : convention générée + signée (1 signature suffit).
INSERT INTO app.documents (id, organization_id, dossier_id, kind, title, status) VALUES
  ('d0c11111-1111-1111-1111-111111111111', '00ccc000-cccc-cccc-cccc-cccccccccccc', 'd0551111-1111-1111-1111-111111111111', 'convention', 'Convention DOS-G-SIGNED', 'ready');
INSERT INTO app.document_signatures (organization_id, document_id, signer_kind, status, signed_at) VALUES
  ('00ccc000-cccc-cccc-cccc-cccccccccccc', 'd0c11111-1111-1111-1111-111111111111', 'learner', 'signed', now());

-- 1) Détection positive
SELECT ok(
  app.dossier_has_signed_convention('d0551111-1111-1111-1111-111111111111'),
  'dossier avec convention signée : détecté'
);

-- 2) Détection négative
SELECT ok(
  NOT app.dossier_has_signed_convention('d0552222-2222-2222-2222-222222222222'),
  'dossier sans convention signée : non détecté'
);

-- 3) Hard DELETE bloqué sur dossier signé (check_violation = 23514)
SELECT throws_ok(
  $$ DELETE FROM app.dossiers WHERE id = 'd0551111-1111-1111-1111-111111111111' $$,
  '23514',
  NULL,
  'DELETE dur d''un dossier à convention signée : bloqué'
);

-- 4) Soft-delete (deleted_at) bloqué sur dossier signé
SELECT throws_ok(
  $$ UPDATE app.dossiers SET deleted_at = now() WHERE id = 'd0551111-1111-1111-1111-111111111111' $$,
  '23514',
  NULL,
  'Soft-delete d''un dossier à convention signée : bloqué'
);

-- 5) Soft-delete autorisé sur dossier NON signé
SELECT lives_ok(
  $$ UPDATE app.dossiers SET deleted_at = now() WHERE id = 'd0552222-2222-2222-2222-222222222222' $$,
  'Soft-delete d''un dossier sans convention signée : autorisé'
);

-- 6) Hard DELETE autorisé sur dossier NON signé
SELECT lives_ok(
  $$ DELETE FROM app.dossiers WHERE id = 'd0552222-2222-2222-2222-222222222222' $$,
  'DELETE dur d''un dossier sans convention signée : autorisé'
);

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
