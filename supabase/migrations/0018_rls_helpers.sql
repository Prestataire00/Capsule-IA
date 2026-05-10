-- ============================================================================
-- 0018 — RLS HELPERS (membership, role, scoping)
-- ============================================================================

CREATE OR REPLACE FUNCTION app.current_member_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'member_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION app.is_org_member(org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT org IS NOT NULL AND org = app.current_organization_id();
$$;

CREATE OR REPLACE FUNCTION app.has_role(VARIADIC roles text[])
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT app.current_role() = ANY(roles);
$$;

CREATE OR REPLACE FUNCTION app.is_admin_or_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT app.current_role() IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION app.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT app.current_role() IN ('owner', 'admin', 'gestionnaire');
$$;

CREATE OR REPLACE FUNCTION app.is_dossier_trainer(p_dossier_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.dossier_trainers dt
    JOIN app.trainers t ON t.id = dt.trainer_id
    WHERE dt.dossier_id = p_dossier_id
      AND t.user_id = auth.uid()
      AND dt.organization_id = app.current_organization_id()
  );
$$;
