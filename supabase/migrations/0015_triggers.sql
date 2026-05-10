-- ============================================================================
-- 0015 — Triggers : updated_at, audit, dossier transitions, audit append-only
-- ============================================================================

-- 1. set_updated_at sur toutes les tables avec updated_at
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('app', 'audit', 'infra')
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = pg_tables.schemaname
          AND table_name = pg_tables.tablename
          AND column_name = 'updated_at'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tg_set_updated_at ON %I.%I; '
      'CREATE TRIGGER tg_set_updated_at BEFORE UPDATE ON %I.%I '
      'FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();',
      r.schemaname, r.tablename, r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- 2. Audit trigger générique
CREATE OR REPLACE FUNCTION audit.audit_row()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_org UUID;
  v_row_id UUID;
BEGIN
  BEGIN
    EXECUTE format('SELECT ($1).organization_id') INTO v_org USING NEW;
  EXCEPTION WHEN undefined_column THEN
    v_org := NULL;
  END;
  IF v_org IS NULL AND TG_OP <> 'DELETE' THEN
    BEGIN
      EXECUTE format('SELECT ($1).organization_id') INTO v_org USING OLD;
    EXCEPTION WHEN undefined_column THEN
      v_org := NULL;
    END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row_id := (OLD.id);
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'delete',
       to_jsonb(OLD), NULL, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_id := (NEW.id);
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'update',
       to_jsonb(OLD), to_jsonb(NEW),
       (SELECT jsonb_object_agg(key, value)
          FROM jsonb_each(to_jsonb(NEW))
         WHERE to_jsonb(OLD) -> key IS DISTINCT FROM value));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    v_row_id := (NEW.id);
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'insert',
       NULL, to_jsonb(NEW), NULL);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  audited_tables TEXT[] := ARRAY[
    'app.organizations', 'app.members', 'app.invitations',
    'app.companies', 'app.learners',
    'app.formations', 'app.modules',
    'app.dossiers', 'app.dossier_modules', 'app.dossier_funders', 'app.dossier_trainers',
    'app.sessions', 'app.attendance_sheets', 'app.attendance_signatures',
    'app.documents', 'app.document_signatures',
    'app.qualiopi_proofs',
    'app.complaints',
    'app.invoices', 'app.payments'
  ];
  t TEXT;
  schema_name TEXT;
  table_name TEXT;
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    schema_name := split_part(t, '.', 1);
    table_name := split_part(t, '.', 2);
    EXECUTE format(
      'DROP TRIGGER IF EXISTS tg_audit ON %I.%I; '
      'CREATE TRIGGER tg_audit AFTER INSERT OR UPDATE OR DELETE ON %I.%I '
      'FOR EACH ROW EXECUTE FUNCTION audit.audit_row();',
      schema_name, table_name, schema_name, table_name
    );
  END LOOP;
END $$;

-- 3. Garde-fou transitions de statut Dossier + historique
CREATE OR REPLACE FUNCTION app.guard_dossier_transitions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE valid BOOLEAN := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO app.dossier_status_history
      (organization_id, dossier_id, from_status, to_status, triggered_by)
    VALUES
      (NEW.organization_id, NEW.id, NULL, NEW.status, auth.uid());
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  valid := CASE
    WHEN OLD.status = 'draft'              AND NEW.status IN ('pending_validation','cancelled') THEN true
    WHEN OLD.status = 'pending_validation' AND NEW.status IN ('scheduled','draft','cancelled') THEN true
    WHEN OLD.status = 'scheduled'          AND NEW.status IN ('active','cancelled') THEN true
    WHEN OLD.status = 'active'             AND NEW.status IN ('completed','cancelled') THEN true
    WHEN OLD.status = 'completed'          AND NEW.status IN ('closed') THEN true
    WHEN OLD.status = 'closed'             AND NEW.status IN ('archived') THEN true
    WHEN OLD.status = 'closed'             AND NEW.status = 'active'
         AND app.current_role() IN ('owner','admin') THEN true
    ELSE false
  END;

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid dossier transition % -> %', OLD.status, NEW.status;
  END IF;

  INSERT INTO app.dossier_status_history
    (organization_id, dossier_id, from_status, to_status, triggered_by)
  VALUES
    (NEW.organization_id, NEW.id, OLD.status, NEW.status, auth.uid());

  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_dossier_transitions
BEFORE INSERT OR UPDATE OF status ON app.dossiers
FOR EACH ROW EXECUTE FUNCTION app.guard_dossier_transitions();

-- 4. Audit log : append-only
CREATE OR REPLACE FUNCTION audit.deny_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_log is append-only';
END;
$$;

CREATE TRIGGER tg_audit_no_update BEFORE UPDATE ON audit.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.deny_mutation();
CREATE TRIGGER tg_audit_no_delete BEFORE DELETE ON audit.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.deny_mutation();
