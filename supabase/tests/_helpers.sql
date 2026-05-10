-- ============================================================================
-- pgTAP test helpers
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgtap;

CREATE SCHEMA IF NOT EXISTS tests;

-- Pose un JWT de test dans la session courante
CREATE OR REPLACE FUNCTION tests.set_jwt(
  p_org UUID, p_role TEXT, p_user_id UUID, p_member_id UUID DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user_id::text,
      'organization_id', p_org::text,
      'role', p_role,
      'member_id', COALESCE(p_member_id, p_user_id)::text
    )::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
END $$;

CREATE OR REPLACE FUNCTION tests.clear_jwt() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
END $$;

CREATE OR REPLACE FUNCTION tests.as_authenticated() RETURNS VOID LANGUAGE sql AS $$
  SET LOCAL ROLE authenticated;
$$;

CREATE OR REPLACE FUNCTION tests.as_service_role() RETURNS VOID LANGUAGE sql AS $$
  SET LOCAL ROLE service_role;
$$;
