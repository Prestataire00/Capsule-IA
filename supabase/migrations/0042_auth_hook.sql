-- ============================================================================
-- 0042 — Auth Hook : custom JWT claims (organization_id, role, member_id)
-- ============================================================================
-- Cf. ADR 0003 (docs/architecture/adr/0003-auth-hook-pl-pgsql.md).
--
-- Database Function PL/pgSQL appelée par Supabase Auth GoTrue avant émission
-- du JWT. Injecte les claims métier consommés par les helpers RLS définis
-- en 0001 (app.current_organization_id, app.current_role) et 0018
-- (app.current_member_id, app.has_role, app.is_staff, etc.).
--
-- ⚠ BLOQUANT MULTI-TENANT : sans cette fonction (ou un mécanisme équivalent
-- configuré côté dashboard Supabase), tous les helpers RLS retournent NULL
-- et les policies refusent l'accès (au mieux) ou laissent fuiter (au pire).
--
-- Procédure de bascule depuis l'Auth Hook actuellement configuré dans le
-- dashboard Supabase Cloud :
--
--   1. supabase db push --linked         (preview/staging d'abord)
--   2. pnpm db:test                       (vérifier que 0042_test_auth_hook.sql passe)
--   3. Tester login en preview : JWT décodé contient organization_id/role/member_id
--   4. Désactiver l'ancien hook dans le dashboard Supabase Cloud
--      (sinon double exécution → comportement imprévisible)
--   5. Merge main → migration appliquée en prod (via CI ou supabase db push)
--
-- Rollback : DROP FUNCTION + réactiver l'ancien hook dashboard. Pas de perte
-- de données (fonction pure).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.before_token_emit(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
DECLARE
  v_user_id         uuid;
  v_organization_id uuid;
  v_role            text;
  v_member_id       uuid;
  v_claims          jsonb;
BEGIN
  v_claims  := COALESCE(event -> 'claims', '{}'::jsonb);
  v_user_id := NULLIF(event ->> 'user_id', '')::uuid;

  IF v_user_id IS NULL THEN
    RETURN event;
  END IF;

  -- Membership "active" : prioritaire is_default_org=true, fallback sur la
  -- plus ancienne (joined_at ASC). LIMIT 1 garantit unicité même sans
  -- contrainte explicite sur (user_id) WHERE is_default_org.
  SELECT m.organization_id, m.role::text, m.id
    INTO v_organization_id, v_role, v_member_id
  FROM app.members m
  WHERE m.user_id = v_user_id
    AND m.deleted_at IS NULL
  ORDER BY m.is_default_org DESC, m.joined_at ASC
  LIMIT 1;

  -- User sans membership active : JWT émis sans claims app.
  -- UI doit gérer : middleware redirige vers /onboarding/organization.
  IF v_organization_id IS NULL THEN
    RETURN event;
  END IF;

  v_claims := v_claims || jsonb_build_object(
    'organization_id', v_organization_id::text,
    'role',            v_role,
    'member_id',       v_member_id::text
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION app.before_token_emit(jsonb) IS
  'Supabase Auth Hook (custom_access_token) : injecte organization_id/role/member_id depuis app.members.is_default_org. Cf. ADR 0003.';

-- GoTrue exécute le hook sous supabase_auth_admin
GRANT USAGE ON SCHEMA app TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION app.before_token_emit(jsonb) TO supabase_auth_admin;

-- Lecture seule de la table members pour le hook (SECURITY DEFINER masque déjà
-- mais ceinture-bretelles : pas de write nécessaire au hook).
GRANT SELECT ON app.members TO supabase_auth_admin;
