-- ============================================================================
-- Tests pgTAP : RLS isolation tenant sur app.email_log
-- ============================================================================
-- Couverture :
--   1. Un membre d'OF A ne voit QUE les email_log de son org (1, pas ceux d'OF B).
--   2. Un membre d'OF A ne voit AUCUN email_log d'OF B (cross-tenant).
-- ============================================================================

BEGIN;
SELECT plan(2);

-- ----------------------------------------------------------------------------
-- Setup : service_role — 2 orgs + 1 user membre d'OF A + 1 email_log par org
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret, slug, contact_email) VALUES
  ('00810a00-0000-0000-0000-000000000001', 'OF A 81', 'OF A 81 SARL', '81110000000001', 'of-a-81', 'contact@of-a-81.test'),
  ('00810b00-0000-0000-0000-000000000002', 'OF B 81', 'OF B 81 SARL', '81220000000002', 'of-b-81', 'contact@of-b-81.test');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00810050-0000-0000-0000-000000000001', 'admin81a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00810050-0000-0000-0000-000000000001', 'Admin 81 A', 'admin81a@of.test');

INSERT INTO app.members (id, organization_id, user_id, role, is_default_org) VALUES
  ('00810500-0000-0000-0000-000000000001', '00810a00-0000-0000-0000-000000000001', '00810050-0000-0000-0000-000000000001', 'admin'::app.member_role, true);

-- 1 trace d'envoi par org (insérée en service_role : pas de policy INSERT)
INSERT INTO app.email_log (id, organization_id, recipient, subject, status, kind) VALUES
  ('00810f00-0000-0000-0000-000000000001', '00810a00-0000-0000-0000-000000000001', 'apprenant@of-a-81.test', 'Convocation OF A', 'sent', 'convocation_j7'),
  ('00810f00-0000-0000-0000-000000000002', '00810b00-0000-0000-0000-000000000002', 'apprenant@of-b-81.test', 'Convocation OF B', 'failed', 'convocation_j7');

-- ----------------------------------------------------------------------------
-- Switch : membre admin d'OF A authentifié
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt(
  '00810a00-0000-0000-0000-000000000001',
  'admin',
  '00810050-0000-0000-0000-000000000001',
  '00810500-0000-0000-0000-000000000001'
);
SELECT tests.as_authenticated();

-- ----------------------------------------------------------------------------
-- TEST 1 : Admin A voit 1 seul email_log au total (uniquement son org)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.email_log),
  1,
  'email_log : admin A ne voit que 1 trace (la sienne, pas celle d''OF B)'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : Admin A ne voit aucun email_log d'org B (cross-tenant)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.email_log WHERE organization_id = '00810b00-0000-0000-0000-000000000002'::uuid),
  0,
  'email_log : admin A voit 0 trace d''OF B (isolation cross-tenant)'
);

SELECT * FROM finish();
ROLLBACK;
