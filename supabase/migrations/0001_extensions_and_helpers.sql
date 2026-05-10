-- ============================================================================
-- 0001 — Extensions, schémas, helpers
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pg_uuidv7";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS infra;
CREATE SCHEMA IF NOT EXISTS reports;

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
