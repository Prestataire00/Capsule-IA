-- Dossiers (réunion avec Laurie, 16/10/2026).
--
-- 1. Statut libre. La machine à états n'autorisait qu'un pas à la fois :
--    impossible de passer un dossier saisi après coup directement en
--    « Terminé », ni de le remettre en « Planifié » quand on attend l'accord
--    de prise en charge. Tout statut est désormais atteignable depuis tout
--    autre, et chaque changement reste tracé dans dossier_status_history.
--    Seule la clôture garde sa garde Qualiopi (tg_dossiers_qualiopi_gate).
--    Un statut n'envoie rien par lui-même : les envois de fin de formation
--    dépendent de la date de fin, et ignorent les dossiers saisis après coup.
--
-- 2. Réglé hors Capsule. Les anciens dossiers ont été facturés et encaissés
--    dans Qonto : on le note sur le dossier, qui cesse d'apparaître comme
--    impayé et n'invite plus à facturer.

CREATE OR REPLACE FUNCTION app.guard_dossier_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'app', 'public'
AS $function$
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

  INSERT INTO app.dossier_status_history
    (organization_id, dossier_id, from_status, to_status, triggered_by)
  VALUES
    (NEW.organization_id, NEW.id, OLD.status, NEW.status, auth.uid());

  -- Les dates suivent le statut, dans les deux sens : un dossier rouvert
  -- n'est plus clos, un dossier réactivé n'est plus annulé.
  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  ELSIF NEW.status NOT IN ('closed', 'archived') THEN
    NEW.closed_at := NULL;
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  ELSIF NEW.status <> 'cancelled' THEN
    NEW.cancelled_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS regle_hors_crm_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS regle_hors_crm_note TEXT CHECK (regle_hors_crm_note IS NULL OR length(regle_hors_crm_note) <= 300);

COMMENT ON COLUMN app.dossiers.regle_hors_crm_at IS 'Facturé et encaissé hors Capsule (ex. Qonto) : le dossier n''est plus impayé.';
