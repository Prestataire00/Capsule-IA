-- ============================================================================
-- 0089 — Fix collision du claim réservé `role` dans le JWT
-- ============================================================================
-- BUG (bloquant, fail-closed) : l'auth hook 0042 écrasait le claim réservé
-- `role` du JWT (normalement `authenticated`) avec le rôle métier (`owner`,
-- `admin`, …). Or PostgREST lit ce claim pour faire `SET ROLE <role>` à chaque
-- requête. Comme `owner` n'est pas un rôle Postgres, TOUTE requête PostgREST
-- échouait :  ERROR 22023 « role "owner" does not exist » → 401 → le client
-- SSR n'obtenait aucune donnée (ex. « Organisme introuvable » sur /parametres).
-- Resté masqué tant que le login était mocké ; révélé par real-login + hook
-- activé en prod.
--
-- Fix : le rôle métier passe sous le claim NON réservé `user_role` ; le claim
-- `role` reste `authenticated`. `app.current_role()` (seul lecteur du claim,
-- via has_role/is_staff/is_admin_or_owner) lit désormais `user_role`.
--
-- ⚠ Les JWT déjà émis (claim `role=owner`) restent cassés jusqu'à reconnexion :
-- les sessions doivent ré-émettre un token (sign-out / sign-in ou refresh).
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

  SELECT m.organization_id, m.role::text, m.id
    INTO v_organization_id, v_role, v_member_id
  FROM app.members m
  WHERE m.user_id = v_user_id
    AND m.deleted_at IS NULL
  ORDER BY m.is_default_org DESC, m.joined_at ASC
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    RETURN event;
  END IF;

  -- `user_role` (et NON `role`, réservé à PostgREST pour SET ROLE).
  v_claims := v_claims || jsonb_build_object(
    'organization_id', v_organization_id::text,
    'user_role',       v_role,
    'member_id',       v_member_id::text
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION app.before_token_emit(jsonb) IS
  'Supabase Auth Hook (custom_access_token) : injecte organization_id/user_role/member_id depuis app.members.is_default_org. user_role (pas role, réservé PostgREST). Cf. ADR 0003 + migration 0089.';

GRANT USAGE ON SCHEMA app TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION app.before_token_emit(jsonb) TO supabase_auth_admin;
GRANT SELECT ON app.members TO supabase_auth_admin;

-- Lit le rôle métier depuis le claim `user_role` (déplacé hors de `role`).
CREATE OR REPLACE FUNCTION app.current_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'user_role';
$$;
