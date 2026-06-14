-- ============================================================================
-- Tests pgTAP : RLS sur app.resource_access_log (append-only audit)
-- ============================================================================
-- Couverture :
--   1. Un membre de l'org voit les lignes d'audit de son org (SELECT ok).
--   2. Un membre authentifié NE PEUT PAS INSERT dans resource_access_log
--      (aucune policy INSERT → deny-by-default FORCE RLS → SQLSTATE 42501).
-- ============================================================================

BEGIN;
SELECT plan(2);

-- ----------------------------------------------------------------------------
-- Setup : 1 org + 1 user membre + 1 ligne d'audit insérée en service_role
-- ----------------------------------------------------------------------------

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret, slug, contact_email) VALUES
  ('00570c00-0000-0000-0000-000000000003', 'OF C 57', 'OF C 57 SARL', '57330000000003', 'of-c-57', 'contact@of-c-57.test');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('00570050-0000-0000-0000-000000000001', 'member57c@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('00570050-0000-0000-0000-000000000001', 'Member 57 C', 'member57c@of.test');

INSERT INTO app.members (id, organization_id, user_id, role, is_default_org) VALUES
  ('00570500-0000-0000-0000-000000000001', '00570c00-0000-0000-0000-000000000003', '00570050-0000-0000-0000-000000000001', 'gestionnaire'::app.member_role, true);

-- Ligne d'audit insérée en service_role (comme le ferait une Edge Function)
INSERT INTO app.resource_access_log
  (id, organization_id, target_kind, target_id, actor_kind, action)
VALUES
  (
    '00570f00-0000-0000-0000-000000000001',
    '00570c00-0000-0000-0000-000000000003',
    'module_resource',
    '00570e00-0000-0000-0000-00000000000c',  -- UUID souple, pas de FK
    'user',
    'view'
  );

-- ----------------------------------------------------------------------------
-- Switch : membre de l'org C authentifié
-- ----------------------------------------------------------------------------
SELECT tests.set_jwt(
  '00570c00-0000-0000-0000-000000000003',
  'gestionnaire',
  '00570050-0000-0000-0000-000000000001',
  '00570500-0000-0000-0000-000000000001'
);
SELECT tests.as_authenticated();

-- ----------------------------------------------------------------------------
-- TEST 1 : membre voit la ligne d'audit de son org (SELECT autorisé)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM app.resource_access_log WHERE organization_id = '00570c00-0000-0000-0000-000000000003'::uuid),
  1,
  'resource_access_log : membre voit la ligne d''audit de son org (SELECT ok)'
);

-- ----------------------------------------------------------------------------
-- TEST 2 : membre NE PEUT PAS INSERT dans resource_access_log
-- Aucune policy INSERT définie → FORCE RLS → deny-by-default → 42501
-- (L''écriture est réservée au service_role / Edge Functions : pas de fausse preuve d''audit)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ INSERT INTO app.resource_access_log
       (organization_id, target_kind, target_id, actor_kind, action)
     VALUES
       ('00570c00-0000-0000-0000-000000000003'::uuid, 'module_resource',
        '00570e00-0000-0000-0000-00000000000c'::uuid, 'user', 'download') $$,
  '42501',
  NULL,
  'resource_access_log : membre authentifié ne peut PAS INSERT (aucune policy INSERT, FORCE RLS)'
);

SELECT * FROM finish();
ROLLBACK;
