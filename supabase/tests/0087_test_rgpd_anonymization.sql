-- ============================================================================
-- Tests pgTAP : anonymisation RGPD (app.anonymize_learner / app.anonymize_prospect)
-- ============================================================================
-- Couvre :
--   gardes : P0401 (rôle insuffisant), P0404 (autre org / absent), P0409 (dossier actif)
--   golden path apprenant : scrub PII + anonymized_at + 1 ligne audit
--   idempotence : ré-appel → status 'already_anonymized' (pas de 2e scrub/audit)
--   golden path prospect : scrub PII + anonymized_at
-- ============================================================================

BEGIN;
SELECT plan(8);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, slug, name, legal_name, siret, contact_email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'of-a', 'OF A', 'OF A SARL', '11111111111111', 'contact-a@of.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'of-b', 'OF B', 'OF B SARL', '22222222222222', 'contact-b@of.test');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'admin-a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'gest-a@of.test',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'admin-b@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Admin A', 'admin-a@of.test'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'Gest A',  'gest-a@of.test'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'Admin B', 'admin-b@of.test');

INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'admin'::app.member_role,        true),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'gestionnaire'::app.member_role, true),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'admin'::app.member_role,        true);

INSERT INTO app.learners (id, organization_id, first_name, last_name, email, phone) VALUES
  ('cccccccc-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 'Durand', 'alice@test.com', '0600000000'),
  ('cccccccc-0000-0000-0000-00000000a002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bob',   'Martin', 'bob@test.com',   '0611111111');

-- Formation requise par le FK NOT NULL app.dossiers.formation_id
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('ffffffff-0000-0000-0000-00000000f001', 'aaaaaaaa-0000-0000-0000-000000000001', 'F-001', 'Formation Test', 'formation-test', 14);

-- Dossier ACTIF pour Alice → doit bloquer l'anonymisation (P0409).
-- Colonnes NOT NULL de app.dossiers : reference, learner_id, formation_id,
-- formation_snapshot, modality, start_date, end_date, total_hours.
INSERT INTO app.dossiers (
  id, organization_id, reference, learner_id, formation_id,
  formation_snapshot, status, modality, start_date, end_date, total_hours
) VALUES (
  'dddddddd-0000-0000-0000-00000000d001', 'aaaaaaaa-0000-0000-0000-000000000001', 'D-001',
  'cccccccc-0000-0000-0000-00000000a001', 'ffffffff-0000-0000-0000-00000000f001',
  '{}'::jsonb, 'active'::app.dossier_status, 'presentiel'::app.training_modality,
  '2026-01-01', '2026-01-31', 14
);

-- ----------------------------------------------------------------------------
-- T1 : gestionnaire → P0401 (rôle insuffisant)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('aaaaaaaa-0000-0000-0000-000000000001', 'gestionnaire', 'aaaaaaaa-0000-0000-0000-0000000000a2');
SELECT tests.as_authenticated();
SELECT throws_ok(
  $$ SELECT app.anonymize_learner('cccccccc-0000-0000-0000-00000000a002') $$,
  'P0401', NULL, 'gestionnaire : refusé (P0401)');

-- ----------------------------------------------------------------------------
-- T2 : admin d'une autre org → P0404 (hors scope org)
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('bbbbbbbb-0000-0000-0000-000000000001', 'admin', 'bbbbbbbb-0000-0000-0000-0000000000b1');
SELECT tests.as_authenticated();
SELECT throws_ok(
  $$ SELECT app.anonymize_learner('cccccccc-0000-0000-0000-00000000a002') $$,
  'P0404', NULL, 'admin autre org : not found (P0404)');

-- ----------------------------------------------------------------------------
-- T3 : Alice a un dossier actif → P0409
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('aaaaaaaa-0000-0000-0000-000000000001', 'admin', 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT tests.as_authenticated();
SELECT throws_ok(
  $$ SELECT app.anonymize_learner('cccccccc-0000-0000-0000-00000000a001') $$,
  'P0409', NULL, 'dossier actif : bloqué (P0409)');

-- ----------------------------------------------------------------------------
-- T4 : golden path — anonymisation de Bob (sans dossier actif)
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT app.anonymize_learner('cccccccc-0000-0000-0000-00000000a002') $$,
  'admin : anonymisation Bob OK');

-- ----------------------------------------------------------------------------
-- T5 : PII scrubbée + anonymized_at posé
-- ----------------------------------------------------------------------------
SELECT tests.as_service_role();
SELECT is(
  (SELECT first_name || '|' || COALESCE(phone, 'NULL') || '|' || (anonymized_at IS NOT NULL)::text
   FROM app.learners WHERE id = 'cccccccc-0000-0000-0000-00000000a002'),
  'Apprenant|NULL|true', 'Bob : prénom anonymisé, téléphone NULL, anonymized_at posé');

-- ----------------------------------------------------------------------------
-- T6 : 1 ligne d'audit RGPD pour Bob.
-- NB : app.learners est aussi audité par le trigger générique tg_audit (0015), qui
-- écrit sa propre ligne sur l'UPDATE. On compte donc la ligne RGPD explicite via le
-- marqueur diff.reason='rgpd_erasure' (la ligne du trigger générique n'a pas ce marqueur).
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM audit.audit_log
   WHERE table_name = 'learners' AND row_id = 'cccccccc-0000-0000-0000-00000000a002'
     AND action = 'update' AND diff->>'reason' = 'rgpd_erasure'),
  1, 'audit : 1 entrée RGPD explicite pour Bob');

-- ----------------------------------------------------------------------------
-- T7 : idempotence — ré-appel ne re-scrub pas, renvoie already_anonymized
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt('aaaaaaaa-0000-0000-0000-000000000001', 'admin', 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT tests.as_authenticated();
SELECT is(
  (SELECT app.anonymize_learner('cccccccc-0000-0000-0000-00000000a002') ->> 'status'),
  'already_anonymized', 'ré-appel : already_anonymized');

-- ----------------------------------------------------------------------------
-- T8 : anonymisation prospect
-- ----------------------------------------------------------------------------
SELECT tests.as_service_role();
INSERT INTO app.prospects (id, organization_id, first_name, last_name, email, situation, funder_kind, status) VALUES
  ('eeeeeeee-0000-0000-0000-00000000e001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Carla', 'Petit', 'carla@test.com',
   'salarie'::app.prospect_situation, 'opco'::app.funder_kind, 'new'::app.prospect_status);
SELECT tests.set_jwt('aaaaaaaa-0000-0000-0000-000000000001', 'admin', 'aaaaaaaa-0000-0000-0000-0000000000a1');
SELECT tests.as_authenticated();
SELECT app.anonymize_prospect('eeeeeeee-0000-0000-0000-00000000e001');
SELECT tests.as_service_role();
SELECT is(
  (SELECT first_name || '|' || (anonymized_at IS NOT NULL)::text
   FROM app.prospects WHERE id = 'eeeeeeee-0000-0000-0000-00000000e001'),
  'Prospect|true', 'Carla : prospect anonymisé');

SELECT * FROM finish();
ROLLBACK;
