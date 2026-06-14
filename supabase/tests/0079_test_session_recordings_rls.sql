-- ============================================================================
-- Tests pgTAP : RLS isolation tenant sur app.session_recordings
-- ============================================================================
-- Couverture :
--   1. Un membre staff d'OF A ne voit QUE les recordings de son org.
--   2. Un membre staff d'OF A ne voit AUCUN recording d'OF B (cross-tenant).
--   3. Un membre staff d'OF A voit bien son propre recording (sanity check).
--   4. Un rôle anon (pas de JWT) ne voit AUCUN recording.
-- ============================================================================

BEGIN;
SELECT plan(4);

-- ----------------------------------------------------------------------------
-- Setup : service_role — 2 orgs + users/members + 1 session par org
--         Chaîne FK : org → learner + formation → dossier → session → recording
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

-- 2 organisations
INSERT INTO app.organizations (id, name, legal_name, siret, slug, contact_email) VALUES
  ('00680a00-0000-0000-0000-000000000001', 'OF A 68', 'OF A 68 SARL', '68110000000001', 'of-a-68', 'contact@of-a-68.test'),
  ('00680b00-0000-0000-0000-000000000002', 'OF B 68', 'OF B 68 SARL', '68220000000002', 'of-b-68', 'contact@of-b-68.test');

-- 1 utilisateur membre staff d'OF A
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00680050-0000-0000-0000-000000000001', 'admin68a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00680050-0000-0000-0000-000000000001', 'Admin 68 A', 'admin68a@of.test');

INSERT INTO app.members (id, organization_id, user_id, role, is_default_org) VALUES
  ('00680500-0000-0000-0000-000000000001', '00680a00-0000-0000-0000-000000000001', '00680050-0000-0000-0000-000000000001', 'admin'::app.member_role, true);

-- 1 apprenant par org (requis par dossier.learner_id NOT NULL)
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('00680c00-0000-0000-0000-000000000001', '00680a00-0000-0000-0000-000000000001', 'Jean', 'Dupont', 'jean.dupont@of-a-68.test'),
  ('00680c00-0000-0000-0000-000000000002', '00680b00-0000-0000-0000-000000000002', 'Marie', 'Martin', 'marie.martin@of-b-68.test');

-- 1 formation par org (requis par dossier.formation_id NOT NULL)
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours, default_price_cents) VALUES
  ('00680d00-0000-0000-0000-000000000001', '00680a00-0000-0000-0000-000000000001', 'FORM-68-A', 'Formation OF A 68', 'formation-of-a-68', 7.0, 0),
  ('00680d00-0000-0000-0000-000000000002', '00680b00-0000-0000-0000-000000000002', 'FORM-68-B', 'Formation OF B 68', 'formation-of-b-68', 7.0, 0);

-- 1 dossier par org (requis par sessions.dossier_id NOT NULL)
-- Colonnes NOT NULL sans défaut : organization_id, reference, learner_id, formation_id,
-- formation_snapshot, modality, start_date, end_date, total_hours
INSERT INTO app.dossiers (
  id, organization_id, reference,
  learner_id, formation_id, formation_snapshot,
  modality, start_date, end_date, total_hours
) VALUES
  (
    '00680e00-0000-0000-0000-000000000001',
    '00680a00-0000-0000-0000-000000000001',
    'DOS-68-A-001',
    '00680c00-0000-0000-0000-000000000001',
    '00680d00-0000-0000-0000-000000000001',
    '{"title": "Formation OF A 68"}'::jsonb,
    'presentiel'::app.training_modality,
    '2026-01-10', '2026-01-17', 7.0
  ),
  (
    '00680e00-0000-0000-0000-000000000002',
    '00680b00-0000-0000-0000-000000000002',
    'DOS-68-B-001',
    '00680c00-0000-0000-0000-000000000002',
    '00680d00-0000-0000-0000-000000000002',
    '{"title": "Formation OF B 68"}'::jsonb,
    'presentiel'::app.training_modality,
    '2026-01-10', '2026-01-17', 7.0
  );

-- 1 session par org (requis par session_recordings.session_id NOT NULL)
-- Colonnes NOT NULL sans défaut : organization_id, dossier_id, modality, starts_at, ends_at
INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at) VALUES
  (
    '00680f00-0000-0000-0000-000000000001',
    '00680a00-0000-0000-0000-000000000001',
    '00680e00-0000-0000-0000-000000000001',
    'distanciel'::app.training_modality,
    '2026-01-10 09:00:00+01',
    '2026-01-10 12:00:00+01'
  ),
  (
    '00680f00-0000-0000-0000-000000000002',
    '00680b00-0000-0000-0000-000000000002',
    '00680e00-0000-0000-0000-000000000002',
    'distanciel'::app.training_modality,
    '2026-01-10 09:00:00+01',
    '2026-01-10 12:00:00+01'
  );

-- 1 recording par session (inséré en service_role : bypass RLS ok)
INSERT INTO app.session_recordings (id, organization_id, session_id, play_url, external_id) VALUES
  (
    '00680100-0000-0000-0000-000000000001',
    '00680a00-0000-0000-0000-000000000001',
    '00680f00-0000-0000-0000-000000000001',
    'https://zoom.us/rec/play/abc123',
    'zoom-rec-a-001'
  ),
  (
    '00680100-0000-0000-0000-000000000002',
    '00680b00-0000-0000-0000-000000000002',
    '00680f00-0000-0000-0000-000000000002',
    'https://zoom.us/rec/play/xyz789',
    'zoom-rec-b-001'
  );

-- ----------------------------------------------------------------------------
-- Switch : membre admin d'OF A authentifié
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt(
  '00680a00-0000-0000-0000-000000000001',
  'admin',
  '00680050-0000-0000-0000-000000000001',
  '00680500-0000-0000-0000-000000000001'
);
SELECT tests.as_authenticated();

-- ----------------------------------------------------------------------------
-- TEST 1 : Admin A voit 1 seul recording au total (uniquement son org)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.session_recordings),
  1,
  'session_recordings : admin A ne voit que 1 recording (le sien, pas celui d''OF B)'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : Admin A ne voit aucun recording d''org B (cross-tenant)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.session_recordings WHERE organization_id = '00680b00-0000-0000-0000-000000000002'::uuid),
  0,
  'session_recordings : admin A voit 0 recording d''OF B (isolation cross-tenant)'
);

-- ----------------------------------------------------------------------------
-- TEST 3 : Admin A voit bien son propre recording (sanity check inverse)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.session_recordings WHERE organization_id = '00680a00-0000-0000-0000-000000000001'::uuid),
  1,
  'session_recordings : admin A voit 1 recording de son propre org (sanity check)'
);

-- ----------------------------------------------------------------------------
-- Switch : rôle anon (pas de JWT) — simule accès sans session
-- ----------------------------------------------------------------------------
SELECT tests.clear_jwt();
SET LOCAL ROLE anon;

-- ----------------------------------------------------------------------------
-- TEST 4 : anon voit 0 recording (aucun accès sans JWT)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.session_recordings),
  0,
  'session_recordings : anon voit 0 recording (aucun accès sans JWT)'
);

SELECT * FROM finish();
ROLLBACK;
