-- ============================================================================
-- 0035 — RLS pour attendance_token_jtis, tenant_integrations, zoom_*
-- ============================================================================
-- attendance_token_jtis : aucune policy = aucun accès via authenticated (RLS forced).
-- Toutes les écritures passent par RPC SECURITY DEFINER (consume_attendance_token).

-- ── tenant_integrations : admin/owner uniquement ─────────────────────────────
CREATE POLICY tenant_integrations_select ON app.tenant_integrations FOR SELECT
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY tenant_integrations_insert ON app.tenant_integrations FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY tenant_integrations_update ON app.tenant_integrations FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY tenant_integrations_delete ON app.tenant_integrations FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

-- ── zoom_sync_logs : lecture pour membres staff/formateur ────────────────────
CREATE POLICY zoom_sync_logs_select ON app.zoom_sync_logs FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('formateur'))
);

-- ── zoom_import_unmatched : staff/formateur read + resolve ───────────────────
CREATE POLICY zoom_unmatched_select ON app.zoom_import_unmatched FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('formateur'))
);

CREATE POLICY zoom_unmatched_update ON app.zoom_import_unmatched FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('formateur'))
)
WITH CHECK (organization_id = app.current_organization_id());
