-- 0104_fix_audit_row_no_id.sql
-- BUG (bloquant) : audit.audit_row() fait `v_row_id := (NEW.id)` / `(OLD.id)`.
-- Or le trigger d'audit `tg_audit` est posé (0015) sur des tables à PK COMPOSITE
-- sans colonne `id` — notamment app.dossier_trainers (PK dossier_id+trainer_id).
-- Conséquence : sélectionner un formateur à la création d'un dossier déclenche
-- l'INSERT dans dossier_trainers → l'audit évalue NEW.id → ERREUR
-- « record "new" has no field "id" » → toute la création de dossier échoue.
--
-- Fix : résoudre l'id de façon SÛRE (même pattern EXCEPTION que organization_id) ;
-- les tables sans `id` enregistrent simplement row_id = NULL dans l'audit.

CREATE OR REPLACE FUNCTION audit.audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, app, auth, public
AS $$
DECLARE
  v_org UUID;
  v_row_id UUID;
BEGIN
  -- organization_id (peut être absent sur certaines tables)
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
    BEGIN
      EXECUTE format('SELECT ($1).id') INTO v_row_id USING OLD;
    EXCEPTION WHEN undefined_column THEN
      v_row_id := NULL;
    END;
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'delete',
       to_jsonb(OLD), NULL, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    BEGIN
      EXECUTE format('SELECT ($1).id') INTO v_row_id USING NEW;
    EXCEPTION WHEN undefined_column THEN
      v_row_id := NULL;
    END;
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
    BEGIN
      EXECUTE format('SELECT ($1).id') INTO v_row_id USING NEW;
    EXCEPTION WHEN undefined_column THEN
      v_row_id := NULL;
    END;
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
