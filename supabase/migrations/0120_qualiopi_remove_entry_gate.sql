-- ============================================================================
-- 0120 — Qualiopi : retrait du blocage d'ENTRÉE au démarrage (demande Ismael)
-- ============================================================================
-- Le démarrage d'un dossier (statut → active) n'est plus bloqué par les
-- indicateurs Qualiopi d'entrée. La checklist Qualiopi reste calculée et
-- affichée (informative, badge qualiopi_ready conservé) mais ne lève plus
-- d'exception « qualiopi_entry_blocked ».
-- Le blocage de CLÔTURE (→ closed) est conservé.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.tg_qualiopi_transition_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  r RECORD;
  v_missing TEXT;
BEGIN
  SELECT * INTO r FROM app.eval_qualiopi_counts(NEW.id);
  NEW.qualiopi_ready := (r.blocking_missing = 0);

  -- Gate d'ENTRÉE retiré : le démarrage n'est plus bloqué par les indicateurs
  -- Qualiopi d'entrée (la checklist reste informative).

  IF NEW.status = 'closed' AND OLD.status <> 'closed'
     AND r.closing_blocking_missing > 0 THEN
    SELECT string_agg(d->>'number', ', ' ORDER BY (d->>'number')::int)
      INTO v_missing
    FROM app.qualiopi_dossier_checklists c,
         jsonb_array_elements(c.details) d
    WHERE c.dossier_id = NEW.id
      AND d->>'stage' = 'closing' AND (d->>'is_blocking')::boolean
      AND NOT (d->>'satisfied')::boolean;
    RAISE EXCEPTION 'qualiopi_closing_blocked: indicateurs % manquants', v_missing
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;
