-- ============================================================================
-- Tests pgTAP : Auth Hook app.before_token_emit (cf. ADR 0003, migration 0042)
-- ============================================================================
-- Couvre :
--   - User mono-org : claims injectés correctement
--   - User multi-org : is_default_org=true gagne
--   - User sans membership : event retourné tel quel (pas crash)
--   - User avec membership soft-deleted : ignoré
--   - User_id NULL : pas crash
--   - Claim réservé `role` jamais écrasé (régression 0089)
-- ============================================================================

BEGIN;
SELECT plan(9);

-- ----------------------------------------------------------------------------
-- Setup
-- ----------------------------------------------------------------------------

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('11111111-1111-1111-1111-111111111111', 'OF A', 'OF A SARL', '00000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'OF B', 'OF B SARL', '00000000000002');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'solo@example.com',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'multi@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'noorg@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'deleted@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Solo',    'solo@example.com'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Multi',   'multi@example.com'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'NoOrg',   'noorg@example.com'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Deleted', 'deleted@example.com');

-- Solo : 1 membership OF A (admin)
INSERT INTO app.members (id, organization_id, user_id, role, is_default_org, joined_at) VALUES
  ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'admin'::app.member_role, true, '2026-01-01');

-- Multi : OF A (owner, default) + OF B (admin, non-default)
INSERT INTO app.members (id, organization_id, user_id, role, is_default_org, joined_at) VALUES
  ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'owner'::app.member_role, true,  '2026-01-01'),
  ('bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'admin'::app.member_role, false, '2026-02-01');

-- Deleted : membership soft-deleted (deleted_at NOT NULL)
INSERT INTO app.members (id, organization_id, user_id, role, is_default_org, joined_at, deleted_at) VALUES
  ('dddd1111-dddd-dddd-dddd-dddddddddddd',
   '11111111-1111-1111-1111-111111111111',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'gestionnaire'::app.member_role, true, '2026-01-01', '2026-03-01');

-- ----------------------------------------------------------------------------
-- TEST 1-2 : User mono-org → claims injectés
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'claims', jsonb_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email', 'solo@example.com')
  )) -> 'claims' ->> 'organization_id',
  '11111111-1111-1111-1111-111111111111',
  'mono-org : organization_id injecté'
);

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'claims', '{}'::jsonb
  )) -> 'claims' ->> 'user_role',
  'admin',
  'mono-org : user_role injecté'
);

-- ----------------------------------------------------------------------------
-- TEST 3-4 : User multi-org → is_default_org=true gagne (OF A)
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'claims', '{}'::jsonb
  )) -> 'claims' ->> 'organization_id',
  '11111111-1111-1111-1111-111111111111',
  'multi-org : default OF A choisi (is_default_org=true)'
);

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'claims', '{}'::jsonb
  )) -> 'claims' ->> 'user_role',
  'owner',
  'multi-org : user_role de l''OF default (owner)'
);

-- ----------------------------------------------------------------------------
-- TEST 5 : User sans membership → event inchangé (pas de claims app)
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'claims', jsonb_build_object('sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc')
  )) -> 'claims' ->> 'organization_id',
  NULL,
  'sans org : organization_id NULL (UI redirige onboarding)'
);

-- ----------------------------------------------------------------------------
-- TEST 6 : User avec membership soft-deleted → ignoré
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'claims', '{}'::jsonb
  )) -> 'claims' ->> 'organization_id',
  NULL,
  'membership soft-deleted : ignoré (pas de claim org)'
);

-- ----------------------------------------------------------------------------
-- TEST 7 : User_id NULL/manquant → event retourné inchangé
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'claims', jsonb_build_object('sub', NULL)
  )) -> 'claims' ->> 'organization_id',
  NULL,
  'user_id manquant : pas de crash, pas de claim app'
);

-- ----------------------------------------------------------------------------
-- TEST 8 : claims existants préservés
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'claims', jsonb_build_object('sub', 'aaa', 'email', 'solo@example.com', 'custom_x', 'preserve_me')
  )) -> 'claims' ->> 'custom_x',
  'preserve_me',
  'claims existants préservés (sub, email, custom_x)'
);

-- ----------------------------------------------------------------------------
-- TEST 9 : claim réservé `role` JAMAIS écrasé (régression 0089)
-- PostgREST l'utilise pour SET ROLE : doit rester `authenticated`.
-- ----------------------------------------------------------------------------

SELECT is(
  app.before_token_emit(jsonb_build_object(
    'user_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'claims', jsonb_build_object('role', 'authenticated')
  )) -> 'claims' ->> 'role',
  'authenticated',
  'régression 0089 : claim réservé role préservé (non écrasé par le rôle métier)'
);

SELECT * FROM finish();
ROLLBACK;
