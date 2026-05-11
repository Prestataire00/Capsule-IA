-- supabase/migrations/0029_trainer_multi_membership.sql
-- ============================================================================
-- 0029 — Trainer multi-membership : index, unique, RPCs, triggers
-- ============================================================================
-- Permet à un même auth.users.id d'avoir N lignes app.trainers (1 par OF).
-- Linkage automatique via trigger + RPC idempotente appelée au layout load.
-- Trigger garde-fou : le formateur lui-même ne peut pas changer ses champs
-- admin-only (email, is_internal, hourly_rate_cents, siret, organization_id).

-- 1) Index lookup cross-OF par user_id
CREATE INDEX ix_trainers_user_id
  ON app.trainers(user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- 2) Unique (user_id, organization_id) : 1 fiche max par user par OF
CREATE UNIQUE INDEX ux_trainers_user_org
  ON app.trainers(user_id, organization_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- 3) RPC : liste les memberships du user courant
CREATE OR REPLACE FUNCTION app.list_my_trainer_memberships()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  trainer_id UUID,
  first_name TEXT,
  last_name TEXT,
  is_internal BOOLEAN
)
LANGUAGE sql SECURITY DEFINER SET search_path = app, public STABLE AS $$
  SELECT o.id, o.name, t.id, t.first_name, t.last_name, t.is_internal
  FROM app.trainers t
  JOIN app.organizations o ON o.id = t.organization_id
  WHERE t.user_id = auth.uid()
    AND t.deleted_at IS NULL
  ORDER BY o.name;
$$;
GRANT EXECUTE ON FUNCTION app.list_my_trainer_memberships() TO authenticated;

-- 4) Trigger autolink à l'INSERT/UPDATE d'app.trainers
CREATE OR REPLACE FUNCTION app.trainers_autolink_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT id INTO NEW.user_id FROM auth.users WHERE email = NEW.email LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_trainers_autolink
  BEFORE INSERT OR UPDATE OF email ON app.trainers
  FOR EACH ROW EXECUTE FUNCTION app.trainers_autolink_user();

-- 5) RPC idempotente : link les fiches orphelines pour le user courant
CREATE OR REPLACE FUNCTION app.link_my_trainer_rows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_email CITEXT;
  v_count INTEGER;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN 0; END IF;

  UPDATE app.trainers
  SET user_id = auth.uid(), updated_at = now()
  WHERE email = v_email AND user_id IS NULL AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION app.link_my_trainer_rows() TO authenticated;

-- 6) Trigger garde-fou self-edit
CREATE OR REPLACE FUNCTION app.trainers_self_edit_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Si l'updater est le trainer lui-même (user_id du row = auth.uid()),
  -- aucun champ admin-only ne doit changer.
  IF NEW.user_id = auth.uid() AND OLD.user_id = auth.uid() THEN
    IF NEW.email             IS DISTINCT FROM OLD.email             OR
       NEW.is_internal       IS DISTINCT FROM OLD.is_internal       OR
       NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents OR
       NEW.siret             IS DISTINCT FROM OLD.siret             OR
       NEW.organization_id   IS DISTINCT FROM OLD.organization_id
    THEN
      RAISE EXCEPTION 'forbidden field update by trainer self'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tr_trainers_self_edit_guard
  BEFORE UPDATE ON app.trainers
  FOR EACH ROW EXECUTE FUNCTION app.trainers_self_edit_guard();
