-- ============================================================================
-- 0114 — Fix garde-fou transitions dossier : RLS historique + alignement modèle
-- ============================================================================
-- 1) SECURITY DEFINER : le trigger insère dans app.dossier_status_history, table
--    dont la RLS n'expose qu'une policy SELECT (écriture réservée au trigger).
--    En SECURITY INVOKER, une transition déclenchée par un client utilisateur
--    échouait : « new row violates row-level security policy for table
--    dossier_status_history ». DEFINER = l'insert s'exécute comme propriétaire.
-- 2) CASE aligné sur le modèle "pragmatique" exposé à l'UI (status-transitions.ts) :
--    draft→active (démarrer directement), pending_validation→active, active→closed.
--    La conformité reste garantie par le gate Qualiopi (tg_qualiopi_transition_gate).
-- ============================================================================

CREATE OR REPLACE FUNCTION app.guard_dossier_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
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
    WHEN OLD.status = 'draft'              AND NEW.status IN ('active','pending_validation','cancelled') THEN true
    WHEN OLD.status = 'pending_validation' AND NEW.status IN ('active','scheduled','draft','cancelled') THEN true
    WHEN OLD.status = 'scheduled'          AND NEW.status IN ('active','cancelled') THEN true
    WHEN OLD.status = 'active'             AND NEW.status IN ('completed','closed','cancelled') THEN true
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
