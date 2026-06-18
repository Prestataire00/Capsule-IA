-- ============================================================================
-- 0090 — Fix : audit.audit_row() doit être SECURITY DEFINER
-- ============================================================================
-- BUG (bloquant, fail-closed) : le trigger d'audit `tg_audit` (posé sur ~20
-- tables app : organizations, members, companies, learners, formations,
-- modules, dossiers, sessions, documents, invoices, payments…) appelle
-- `audit.audit_row()`, défini en 0015 SANS SECURITY DEFINER. La fonction
-- s'exécute donc sous le rôle appelant et INSERT dans `audit.audit_log`.
-- Or `service_role`, `authenticated` et `anon` n'ont AUCUN droit sur le schéma
-- `audit` → toute écriture (INSERT/UPDATE/DELETE) via PostgREST échoue :
--   ERROR 42501 « permission denied for schema audit » → HTTP 403.
-- Symptôme observé : « Une erreur est survenue » à la création de formation
-- (action via supabaseAdmin/service_role), mais l'impact couvre TOUTES les
-- écritures sur tables auditées (service_role ET authenticated).
--
-- Resté masqué tant que les écritures passaient en local (rôle postgres, qui
-- possède tout) ; révélé par l'usage réel via PostgREST.
--
-- Fix : SECURITY DEFINER → la fonction s'exécute comme son owner (postgres) et
-- écrit dans `audit` quel que soit l'appelant. Les clients n'ont JAMAIS besoin
-- d'accès direct au schéma audit (préférable à des GRANT larges côté clients).
-- search_path épinglé (sécurité SECURITY DEFINER) ; toutes les références sont
-- déjà schéma-qualifiées. Corps identique à 0015.
-- ============================================================================

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
