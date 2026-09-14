-- Audit générique : ne plus exiger une colonne `id` sur la table auditée.
--
-- `audit.audit_row()` lisait `NEW.id` directement. Or `app.dossier_trainers` a
-- une clé primaire composée (dossier_id, trainer_id) et aucune colonne `id` :
-- toute écriture y échouait donc avec « record "new" has no field "id" ».
-- Conséquence observée en production : affecter un formateur à un dossier était
-- impossible, sans message compréhensible côté application.
--
-- `audit.audit_log.row_id` étant nullable, on lit l'identifiant via `to_jsonb`
-- et on accepte son absence. Les tables à clé simple sont auditées comme avant.

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
    v_row_id := NULLIF(to_jsonb(OLD) ->> 'id', '')::uuid;
    INSERT INTO audit.audit_log
      (organization_id, actor_user_id, actor_ip, actor_user_agent,
       schema_name, table_name, row_id, action, before, after, diff)
    VALUES
      (v_org, auth.uid(), app.current_actor_ip(), app.current_actor_user_agent(),
       TG_TABLE_SCHEMA, TG_TABLE_NAME, v_row_id, 'delete',
       to_jsonb(OLD), NULL, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_row_id := NULLIF(to_jsonb(NEW) ->> 'id', '')::uuid;
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
    v_row_id := NULLIF(to_jsonb(NEW) ->> 'id', '')::uuid;
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
