-- ============================================================================
-- 0001 — Extensions, schémas, helpers
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
-- pg_cron : activer via Supabase Dashboard (Database → Extensions) avant de planifier des jobs.

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS infra;
CREATE SCHEMA IF NOT EXISTS reports;

-- UUIDv7 polyfill : Supabase Cloud n'expose pas l'extension pg_uuidv7.
-- Implémentation SQL pure équivalente, accessible sans qualification via le search_path.
CREATE OR REPLACE FUNCTION public.uuidv7()
RETURNS uuid
LANGUAGE sql VOLATILE PARALLEL SAFE
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(
                  (extract(epoch from clock_timestamp()) * 1000)::bigint
                ) from 3)
                from 1 for 6),
        52, 1),
      53, 1),
    'hex')::uuid;
$$;

-- Trigger générique : updated_at
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- JWT helpers
CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'role';
$$;

CREATE OR REPLACE FUNCTION app.current_actor_ip()
RETURNS INET LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_ip', true), '')::inet;
$$;

CREATE OR REPLACE FUNCTION app.current_actor_user_agent()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.actor_user_agent', true), '');
$$;

COMMENT ON FUNCTION app.current_organization_id() IS
  'Retourne organization_id depuis le JWT. NULL en service_role / anon.';
