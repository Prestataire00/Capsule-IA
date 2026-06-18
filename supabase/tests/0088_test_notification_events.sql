-- ============================================================================
-- Tests pgTAP : triggers de notifications in-app (migration 0088)
--   1 inscription apprenant à une session       -> learner_enrolled
--   2 document généré (status ready)            -> document_generated
--   3 document signé (status signed)            -> document_signed
--   4 questionnaire complété (réponse insérée)  -> questionnaire_completed
--   + colonne read_at présente
-- ============================================================================
BEGIN;
SELECT plan(5);

SELECT tests.as_service_role();

-- Fixtures de base (org / apprenant / formation / dossier).
INSERT INTO app.organizations (id, slug, name, legal_name, siret, contact_email) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000ff', 'of-notif', 'OF Notif', 'OF Notif SARL', '11111111111111', 'notif@of.test');

INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('cccccccc-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'Bob', 'Notif', 'bob.notif@test.com');

INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('ffffffff-0000-0000-0000-00000000f001', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'F-NOTIF', 'Formation Notif', 'formation-notif', 14);

INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours) VALUES
  ('dddddddd-0000-0000-0000-00000000d001', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'DOS-NOTIF',
   'cccccccc-0000-0000-0000-00000000a001', 'ffffffff-0000-0000-0000-00000000f001', '{}'::jsonb,
   'presentiel', '2026-07-01', '2026-07-10', 14);

-- ----------------------------------------------------------------------------
-- 1) Inscription apprenant à une session -> learner_enrolled
-- ----------------------------------------------------------------------------
INSERT INTO app.sessions (id, organization_id, dossier_id, title, modality, starts_at, ends_at) VALUES
  ('55555555-0000-0000-0000-000000005001', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'dddddddd-0000-0000-0000-00000000d001',
   'Session 1', 'presentiel', '2026-07-01 09:00+00', '2026-07-01 12:00+00');
INSERT INTO app.session_participants (session_id, organization_id, participant_kind, learner_id) VALUES
  ('55555555-0000-0000-0000-000000005001', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'learner', 'cccccccc-0000-0000-0000-00000000a001');

SELECT is(
  (SELECT count(*)::int FROM app.notifications
   WHERE organization_id = 'aaaaaaaa-0000-0000-0000-0000000000ff' AND template_code = 'learner_enrolled'),
  1, 'inscription apprenant -> 1 notif learner_enrolled');

-- ----------------------------------------------------------------------------
-- 2) Document généré (status ready) -> document_generated
-- ----------------------------------------------------------------------------
INSERT INTO app.documents (id, organization_id, dossier_id, kind, title, status) VALUES
  ('d0c00000-0000-0000-0000-00000000d0c1', 'aaaaaaaa-0000-0000-0000-0000000000ff', 'dddddddd-0000-0000-0000-00000000d001',
   'convention', 'Convention de formation', 'ready');

SELECT is(
  (SELECT count(*)::int FROM app.notifications
   WHERE organization_id = 'aaaaaaaa-0000-0000-0000-0000000000ff' AND template_code = 'document_generated'),
  1, 'document ready -> 1 notif document_generated');

-- ----------------------------------------------------------------------------
-- 3) Document signé (status signed) -> document_signed
-- ----------------------------------------------------------------------------
INSERT INTO app.document_signatures (organization_id, document_id, signer_kind, signer_learner_id, signer_name, status, signed_at) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000ff', 'd0c00000-0000-0000-0000-00000000d0c1', 'learner',
   'cccccccc-0000-0000-0000-00000000a001', 'Bob Notif', 'signed', now());

SELECT is(
  (SELECT count(*)::int FROM app.notifications
   WHERE organization_id = 'aaaaaaaa-0000-0000-0000-0000000000ff' AND template_code = 'document_signed'),
  1, 'document signé -> 1 notif document_signed');

-- ----------------------------------------------------------------------------
-- 4) Questionnaire complété (réponse soumise) -> questionnaire_completed
-- ----------------------------------------------------------------------------
INSERT INTO app.questionnaire_templates (id, organization_id, kind, code, title) VALUES
  ('79900000-0000-0000-0000-0000000079a1', 'aaaaaaaa-0000-0000-0000-0000000000ff',
   (SELECT enumlabel::app.questionnaire_kind FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'questionnaire_kind' LIMIT 1),
   'Q-NOTIF', 'Satisfaction à chaud');
INSERT INTO app.questionnaire_assignments (id, organization_id, template_id, dossier_id, recipient_kind, recipient_learner_id, recipient_name, token_hash) VALUES
  ('a5500000-0000-0000-0000-0000000a5501', 'aaaaaaaa-0000-0000-0000-0000000000ff', '79900000-0000-0000-0000-0000000079a1',
   'dddddddd-0000-0000-0000-00000000d001', 'learner', 'cccccccc-0000-0000-0000-00000000a001', 'Bob Notif', 'tok-notif-test-1');
INSERT INTO app.questionnaire_responses (organization_id, assignment_id, template_id, dossier_id, answers) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000ff', 'a5500000-0000-0000-0000-0000000a5501', '79900000-0000-0000-0000-0000000079a1',
   'dddddddd-0000-0000-0000-00000000d001', '{}'::jsonb);

SELECT is(
  (SELECT count(*)::int FROM app.notifications
   WHERE organization_id = 'aaaaaaaa-0000-0000-0000-0000000000ff' AND template_code = 'questionnaire_completed'),
  1, 'questionnaire complété -> 1 notif questionnaire_completed');

-- ----------------------------------------------------------------------------
-- 5) Colonne read_at présente
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
   WHERE table_schema = 'app' AND table_name = 'notifications' AND column_name = 'read_at'),
  1, 'colonne notifications.read_at présente');

SELECT * FROM finish();
ROLLBACK;
