-- ============================================================================
-- 0103 — Intégration Google Agenda : autorise kind='google_calendar'
-- ============================================================================
-- Stocke (chiffré, par org) le refresh token OAuth Google permettant de créer
-- des évènements Agenda + lien Meet pour les sessions distancielles.
-- Réutilise toutes les colonnes de app.tenant_integrations et sa RLS (admin/owner).
-- ============================================================================

ALTER TABLE app.tenant_integrations DROP CONSTRAINT IF EXISTS tenant_integrations_kind_check;
ALTER TABLE app.tenant_integrations
  ADD CONSTRAINT tenant_integrations_kind_check
  CHECK (kind IN ('zoom_s2s', 'google_calendar'));
