-- ============================================================================
-- pgTAP 0070 — Garde-fou suppression dossier si convention signée
--
-- Vérifie que :
--   1. Un dossier SANS convention signée peut être hard-deleted → OK
--   2. Un dossier AVEC convention signée ne peut pas être hard-deleted → ERREUR
--   3. Un dossier AVEC convention signée ne peut pas être soft-deleted
--        (UPDATE deleted_at) → ERREUR
--   4. Passage à status='archived' (UPDATE status, sans toucher deleted_at)
--        reste autorisé → OK
--        (dossier en statut 'closed' car c'est le seul chemin vers 'archived'
--         selon guard_dossier_transitions : closed → archived)
-- ============================================================================
BEGIN;
SELECT plan(4);

\i supabase/tests/_helpers.sql

SELECT tests.as_service_role();

-- ── Seed ─────────────────────────────────────────────────────────────────────

-- Organisation
INSERT INTO app.organizations (id, name, legal_name, slug, contact_email, siret)
VALUES (
  'a0070000-0000-0000-0000-000000000001',
  'OF Test 70',
  'OF Test 70 SAS',
  'of-test-70',
  'contact@oftest70.fr',
  '12345678901234'
);

-- Apprenant
INSERT INTO app.learners (id, organization_id, first_name, last_name, email)
VALUES (
  'a0070000-0000-0000-0000-000000000002',
  'a0070000-0000-0000-0000-000000000001',
  'Alice',
  'Test',
  'alice@oftest70.fr'
);

-- Formation
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours)
VALUES (
  'a0070000-0000-0000-0000-000000000003',
  'a0070000-0000-0000-0000-000000000001',
  'FORM-70-001',
  'Formation Garde-Fou 70',
  'formation-garde-fou-70',
  7
);

-- Dossier A : SANS convention signée (status draft)
INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours
) VALUES (
  'a0070000-0000-0000-0000-000000000010',
  'a0070000-0000-0000-0000-000000000001',
  'DOS-70-SANS-CONV',
  'a0070000-0000-0000-0000-000000000002',
  'a0070000-0000-0000-0000-000000000003',
  '{"title": "Formation Garde-Fou 70"}'::jsonb,
  'draft',
  'presentiel',
  '2025-01-01',
  '2025-01-31',
  7
);

-- Dossier B : AVEC convention signée.
-- Inséré en statut 'closed' + closed_at pour que la transition → archived
-- soit valide selon guard_dossier_transitions (closed → archived).
INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours, closed_at
) VALUES (
  'a0070000-0000-0000-0000-000000000011',
  'a0070000-0000-0000-0000-000000000001',
  'DOS-70-AVEC-CONV',
  'a0070000-0000-0000-0000-000000000002',
  'a0070000-0000-0000-0000-000000000003',
  '{"title": "Formation Garde-Fou 70"}'::jsonb,
  'closed',
  'presentiel',
  '2025-01-01',
  '2025-01-31',
  7,
  now()
);

-- Document de type 'convention' rattaché au dossier B
INSERT INTO app.documents (
  id, organization_id, dossier_id, kind, title, status
) VALUES (
  'a0070000-0000-0000-0000-000000000020',
  'a0070000-0000-0000-0000-000000000001',
  'a0070000-0000-0000-0000-000000000011',
  'convention',
  'Convention de formation DOS-70-AVEC-CONV',
  'ready'
);

-- Signature 'signed' sur ce document
INSERT INTO app.document_signatures (
  id, organization_id, document_id, signer_kind, signer_email, signer_name, status, signed_at
) VALUES (
  'a0070000-0000-0000-0000-000000000030',
  'a0070000-0000-0000-0000-000000000001',
  'a0070000-0000-0000-0000-000000000020',
  'learner',
  'alice@oftest70.fr',
  'Alice Test',
  'signed',
  now()
);

-- ── Tests ─────────────────────────────────────────────────────────────────────

-- 1. Dossier A (sans convention signée) : DELETE réussit
SELECT lives_ok(
  $$ DELETE FROM app.dossiers WHERE id = 'a0070000-0000-0000-0000-000000000010' $$,
  'DELETE dossier sans convention signée : autorisé'
);

-- 2. Dossier B (avec convention signée) : DELETE levée (check_violation = 23514)
SELECT throws_ok(
  $$ DELETE FROM app.dossiers WHERE id = 'a0070000-0000-0000-0000-000000000011' $$,
  '23514',
  NULL,
  'DELETE dossier avec convention signée : interdit (check_violation)'
);

-- 3. Dossier B : soft-delete (UPDATE deleted_at) levée aussi
SELECT throws_ok(
  $$ UPDATE app.dossiers SET deleted_at = now() WHERE id = 'a0070000-0000-0000-0000-000000000011' $$,
  '23514',
  NULL,
  'Soft-delete dossier avec convention signée : interdit (check_violation)'
);

-- 4. Dossier B : passage à status='archived' (sans toucher deleted_at) → autorisé
--    Transition closed→archived valide selon guard_dossier_transitions.
--    On pose le JWT pour éviter une erreur auth.uid() dans le trigger historique.
SELECT tests.set_jwt(
  'a0070000-0000-0000-0000-000000000001',
  'owner',
  'a0070000-0000-0000-0000-000000000099'
);
SELECT lives_ok(
  $$ UPDATE app.dossiers SET status = 'archived' WHERE id = 'a0070000-0000-0000-0000-000000000011' $$,
  'Archivage (status=archived) dossier avec convention signée : autorisé'
);

SELECT * FROM finish();
ROLLBACK;
