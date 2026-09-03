-- 0138 — Le déclencheur d'audit écrivait sous les droits de l'appelant.
--
-- Constat (audit 2026-09-03, CAP-31) : `audit.audit_row()` était déclarée sans
-- `SECURITY DEFINER`. Elle s'exécutait donc sous le rôle de l'appelant —
-- `authenticated` pour un utilisateur connecté. Or `audit.audit_log` a la RLS
-- activée et forcée (migration 0016) et ne porte qu'une policy **SELECT**
-- (migration 0023) : l'insertion du journal était refusée, l'exception
-- remontait, et **l'écriture d'origine échouait**.
--
-- Le déclencheur est posé sur vingt tables : organizations, members,
-- invitations, companies, learners, formations, modules, dossiers et leurs
-- rattachements, sessions, attendance_sheets, attendance_signatures, documents,
-- document_signatures, qualiopi_proofs, complaints, invoices, payments.
--
-- Toute écriture faite avec la session de l'utilisateur sur l'une d'elles était
-- donc vouée à l'échec. Le défaut est resté invisible parce que la quasi-totalité
-- des écritures de l'application passent par le service role, qui contourne la
-- RLS. Il se manifestait sur les rares actions passant par `authActionClient` —
-- au premier rang desquelles la désactivation d'un membre, dont l'échec était
-- rapporté sans motif.
--
-- Un journal d'audit doit précisément être alimentable par le déclencheur sans
-- l'être directement par l'utilisateur : c'est le rôle de `SECURITY DEFINER`.
-- Le corps de la fonction est repris à l'identique de la migration 0015.

CREATE OR REPLACE FUNCTION audit.audit_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, app, public
AS $$
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

COMMENT ON FUNCTION audit.audit_row() IS
  'Journalise INSERT/UPDATE/DELETE dans audit.audit_log. SECURITY DEFINER : le journal est alimentable par le déclencheur, jamais directement par l''utilisateur (audit CAP-31).';
