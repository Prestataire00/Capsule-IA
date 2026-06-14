-- ============================================================================
-- 0049 — Compteurs bloquants par étape sur la checklist dossier
-- ============================================================================

ALTER TABLE app.qualiopi_dossier_checklists
  ADD COLUMN entry_blocking_missing   INT NOT NULL DEFAULT 0,
  ADD COLUMN closing_blocking_missing INT NOT NULL DEFAULT 0;
