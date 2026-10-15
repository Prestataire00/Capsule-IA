-- Rattrapage des dossiers déjà touchés avant le correctif du 15/10/2026 (vidéo
-- d'Ismael, Serra Paysage) : un OPCO ajouté après le devis laissait la facture
-- brouillon du devis à l'entreprise, et le reste à charge à −5 000 €.
-- Depuis, l'application réaligne les brouillons à chaque changement de
-- financeur (features/billing/domain/brouillons-financeurs.ts). Ici, le seul
-- cas sans ambiguïté, en une passe :
--   - brouillon (facture ou solde) adressé à l'entreprise, non supprimé ;
--   - pas issu d'un devis partagé entre plusieurs dossiers ;
--   - un seul financeur non refusé sur le dossier, sans facture à lui, qui
--     couvre au moins le montant du brouillon ;
--   - le reste à charge est sur-facturé d'au moins ce montant.
-- Une facture émise ne bouge jamais.

CREATE OR REPLACE FUNCTION app.rattraper_brouillons_vers_financeur()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  WITH financeurs AS (
    SELECT df.dossier_id,
           df.funder_id,
           CASE
             WHEN df.status = 'refused' THEN 0
             WHEN df.status IN ('approved', 'paid') THEN COALESCE(df.granted_cents, df.amount_cents)
             ELSE df.amount_cents
           END AS couvert
    FROM app.dossier_funders df
  ),
  par_dossier AS (
    SELECT dossier_id,
           SUM(couvert) AS couvert_total,
           COUNT(*) FILTER (WHERE couvert > 0) AS nb_actifs,
           MAX(funder_id::text) FILTER (WHERE couvert > 0)::uuid AS funder_id,
           MAX(couvert) FILTER (WHERE couvert > 0) AS couvert_financeur
    FROM financeurs
    GROUP BY dossier_id
  ),
  reste AS (
    SELECT i.dossier_id,
           SUM(CASE WHEN i.kind = 'credit_note' THEN -i.subtotal_cents ELSE i.subtotal_cents END) AS facture_entreprise
    FROM app.invoices i
    WHERE i.funder_id IS NULL AND i.status <> 'cancelled' AND i.deleted_at IS NULL AND i.dossier_id IS NOT NULL
    GROUP BY i.dossier_id
  ),
  cibles AS (
    SELECT i.id, p.funder_id
    FROM app.invoices i
    JOIN app.dossiers d ON d.id = i.dossier_id
    JOIN par_dossier p ON p.dossier_id = i.dossier_id
    JOIN reste r ON r.dossier_id = i.dossier_id
    WHERE i.status = 'draft'
      AND i.kind IN ('invoice', 'balance')
      AND i.funder_id IS NULL
      AND i.deleted_at IS NULL
      AND p.nb_actifs = 1
      AND p.couvert_financeur >= i.subtotal_cents
      AND r.facture_entreprise - GREATEST(0, COALESCE(d.total_amount_cents, 0) - p.couvert_total) >= i.subtotal_cents
      AND NOT EXISTS (
        SELECT 1 FROM app.invoices autre
        WHERE autre.dossier_id = i.dossier_id AND autre.funder_id = p.funder_id
          AND autre.status <> 'cancelled' AND autre.deleted_at IS NULL
      )
      AND (i.quote_id IS NULL OR (SELECT COUNT(*) FROM app.quote_dossiers q WHERE q.quote_id = i.quote_id) <= 1)
      -- Un seul brouillon par dossier : s'il y en a plusieurs, l'équipe choisit.
      AND (SELECT COUNT(*) FROM app.invoices b
           WHERE b.dossier_id = i.dossier_id AND b.funder_id IS NULL AND b.status = 'draft'
             AND b.kind IN ('invoice', 'balance') AND b.deleted_at IS NULL) = 1
  )
  UPDATE app.invoices i
  SET funder_id = c.funder_id, updated_at = now()
  FROM cibles c
  WHERE i.id = c.id AND i.status = 'draft';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION app.rattraper_brouillons_vers_financeur() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  n integer := app.rattraper_brouillons_vers_financeur();
BEGIN
  RAISE NOTICE '0230 : % brouillon(s) passé(s) au financeur', n;
END;
$$;
