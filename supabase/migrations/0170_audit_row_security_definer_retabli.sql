-- URGENT — rétablit `SECURITY DEFINER` sur `audit.audit_row()`.
--
-- La 0168 a recréé la fonction pour accepter les tables sans colonne `id`
-- (bonne correction), mais `CREATE OR REPLACE FUNCTION` remplace la définition
-- *entière*, attribut de sécurité compris : en omettant `SECURITY DEFINER`, la
-- fonction est repassée en SECURITY INVOKER.
--
-- Conséquence en production : le déclencheur s'exécute alors avec les droits de
-- l'utilisateur connecté, qui n'a aucun droit sur le schéma `audit`. Toute
-- écriture dans une table auditée échoue — « permission denied for schema
-- audit » — et la transaction entière est annulée. Planifier une session,
-- démarrer une formation : plus rien ne passait.
--
-- C'est la quatrième fois que cet attribut est posé (0090, 0104, 0138) : il ne
-- doit jamais être omis lors d'un `CREATE OR REPLACE` de cette fonction.
-- Le journal reste alimentable par le déclencheur seul, jamais directement par
-- l'utilisateur (audit CAP-31).
--
-- Le corps est celui de la 0168 : identifiant lu via `to_jsonb`, donc les
-- tables à clé composée (`app.dossier_trainers`) restent auditables.

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

COMMENT ON FUNCTION audit.audit_row() IS
  'Journalise INSERT/UPDATE/DELETE dans audit.audit_log. SECURITY DEFINER obligatoire : le journal est alimentable par le déclencheur, jamais directement par l''utilisateur (audit CAP-31). Identifiant lu via to_jsonb pour les tables sans colonne id (0168).';
