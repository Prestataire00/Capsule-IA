-- ============================================================================
-- pgTAP 0082 — app.materialize_attendance_slots : demi-journées + idempotence
--
-- Vérifie :
--   1. Séance 9h-17h Paris (07:00-15:00 UTC été) → 2 feuilles (matin + après-midi)
--   2. Feuille matin créée
--   3. Feuille après-midi créée
--   4. Second appel (idempotence) → 0 feuille créée
--   5. Séance 14h-17h Paris (12:00-15:00 UTC été) → 1 feuille après-midi
--   6. Séance 14h-17h → pas de feuille matin
-- ============================================================================
BEGIN;
SELECT plan(6);

\i supabase/tests/_helpers.sql

SELECT tests.as_service_role();

-- Organisation
INSERT INTO app.organizations (id, name, legal_name, slug, contact_email, siret)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'OF Slots',
  'OF Slots SARL',
  'of-slots-test',
  'contact@ofslots.test',
  '00000000000099'
);

-- Apprenant (FK obligatoire sur dossier)
INSERT INTO app.learners (id, organization_id, first_name, last_name, email)
VALUES (
  '33333333-3333-3333-3333-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-333333333333',
  'Jean',
  'Test',
  'jean@ofslots.test'
);

-- Formation (FK obligatoire sur dossier)
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours)
VALUES (
  '33333333-3333-3333-3333-bbbbbbbbbbbb',
  '33333333-3333-3333-3333-333333333333',
  'FORM-SLOT-001',
  'Formation Slots',
  'formation-slots',
  7
);

-- Dossier
INSERT INTO app.dossiers (
  id, organization_id, reference,
  learner_id, formation_id, formation_snapshot,
  status, modality, start_date, end_date, total_hours
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333333',
  'DOS-SLOT',
  '33333333-3333-3333-3333-aaaaaaaaaaaa',
  '33333333-3333-3333-3333-bbbbbbbbbbbb',
  '{"title": "Formation Slots"}'::jsonb,
  'draft',
  'presentiel',
  '2026-09-01',
  '2026-09-30',
  7
);

-- Séance 9h-17h Paris (CEST = UTC+2 en septembre)
-- 09:00 Paris = 07:00 UTC ; 17:00 Paris = 15:00 UTC
-- → début avant 13:00 Paris → matin ; fin après 13:00 Paris → après-midi → 2 feuilles
INSERT INTO app.sessions (id, organization_id, dossier_id, title, starts_at, ends_at, modality, status)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  'Journée complète',
  '2026-09-15 07:00:00+00',
  '2026-09-15 15:00:00+00',
  'presentiel',
  'planned'
);

-- 1. Séance journée → 2 feuilles (trigger tg_session_materialize_slots a déjà tourné)
SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets
   WHERE session_id = '55555555-5555-5555-5555-555555555555'),
  2,
  'séance 9h-17h → 2 feuilles'
);

-- 2. Feuille matin présente
SELECT ok(
  EXISTS (
    SELECT 1 FROM app.attendance_sheets
    WHERE session_id = '55555555-5555-5555-5555-555555555555'
      AND half_day = 'morning'
  ),
  'feuille matin créée'
);

-- 3. Feuille après-midi présente
SELECT ok(
  EXISTS (
    SELECT 1 FROM app.attendance_sheets
    WHERE session_id = '55555555-5555-5555-5555-555555555555'
      AND half_day = 'afternoon'
  ),
  'feuille après-midi créée'
);

-- 4. Idempotence : second appel explicite → 0 feuille supplémentaire
SELECT is(
  app.materialize_attendance_slots('55555555-5555-5555-5555-555555555555'),
  0,
  'idempotent : second appel crée 0 feuille'
);

-- Séance 14h-17h Paris (CEST = UTC+2 en septembre)
-- 14:00 Paris = 12:00 UTC ; 17:00 Paris = 15:00 UTC
-- → début ≥ 13:00 Paris → pas de matin ; fin > 13:00 Paris → après-midi → 1 feuille
INSERT INTO app.sessions (id, organization_id, dossier_id, title, starts_at, ends_at, modality, status)
VALUES (
  '66666666-6666-6666-6666-666666666666',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  'Après-midi',
  '2026-09-15 12:00:00+00',
  '2026-09-15 15:00:00+00',
  'presentiel',
  'planned'
);

-- 5. Séance 14h-17h → 1 feuille après-midi
SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets
   WHERE session_id = '66666666-6666-6666-6666-666666666666'
     AND half_day = 'afternoon'),
  1,
  'séance 14h-17h → après-midi seule'
);

-- 6. Séance 14h-17h → pas de feuille matin
SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets
   WHERE session_id = '66666666-6666-6666-6666-666666666666'
     AND half_day = 'morning'),
  0,
  'séance 14h-17h → pas de matin'
);

SELECT * FROM finish();
ROLLBACK;
