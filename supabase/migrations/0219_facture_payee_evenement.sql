-- Une facture réglée émet billing.invoice.paid.
--
-- Le traitement existait (cron dispatch-events : dossier terminé → clôturé)
-- mais rien n'émettait l'événement : un dossier réglé restait « terminé » à
-- jamais (audit du 2026-10-07). Le déclencheur couvre tous les chemins — un
-- règlement saisi, un statut changé à la main, une synchronisation bancaire.

CREATE OR REPLACE FUNCTION app.emettre_facture_payee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.dossier_id IS NOT NULL THEN
    INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
    VALUES (NEW.organization_id, 'invoice', NEW.id, 'billing.invoice.paid',
            jsonb_build_object('dossier_id', NEW.dossier_id, 'paid_at', NEW.paid_at));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_facture_payee ON app.invoices;
CREATE TRIGGER tg_facture_payee
  AFTER UPDATE OF status ON app.invoices
  FOR EACH ROW EXECUTE FUNCTION app.emettre_facture_payee();
