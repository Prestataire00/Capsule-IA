-- ============================================================================
-- 0122 — Migration des dépenses dossier → formation (consolidation budget)
-- ============================================================================
-- Phase 2c : remonte les charges historiques saisies au niveau dossier
-- (app.dossier_expenses) vers app.formation_expenses, rattachées à la formation
-- du dossier (session_id NULL = charge générale de la formation).
--
-- IDEMPOTENT : marque chaque ligne migrée via notes = 'from dossier_expense:<id>'
-- et ne recopie pas si déjà présente (NOT EXISTS). NON DESTRUCTIF : app.dossier_expenses
-- est conservée telle quelle (source de vérité BPF actuelle).

INSERT INTO app.formation_expenses (
  organization_id, formation_id, session_id, kind, label, amount_cents, hours,
  supplier_name, incurred_on, notes, created_by, created_at
)
SELECT
  de.organization_id,
  d.formation_id,
  NULL,
  de.kind,
  COALESCE(NULLIF(btrim(de.label), ''), 'Charge'),
  de.amount_cents,
  de.hours,
  de.supplier_name,
  de.incurred_on,
  'from dossier_expense:' || de.id::text,
  de.created_by,
  de.created_at
FROM app.dossier_expenses de
JOIN app.dossiers d ON d.id = de.dossier_id
WHERE de.deleted_at IS NULL
  AND d.formation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM app.formation_expenses fe
    WHERE fe.notes = 'from dossier_expense:' || de.id::text
  );
