-- ============================================================================
-- 0023 — RLS Billing + Infra (notifications, feature flags) + Audit
-- ============================================================================

-- ── invoices ──────────────────────────────────────────────────────
CREATE POLICY invoices_select ON app.invoices FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
);
CREATE POLICY invoices_insert ON app.invoices FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id()
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
);
CREATE POLICY invoices_update ON app.invoices FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
  AND status NOT IN ('paid', 'cancelled')
)
WITH CHECK (organization_id = app.current_organization_id());

-- ── invoice_lines ─────────────────────────────────────────────────
CREATE POLICY invoice_lines_select ON app.invoice_lines FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
);
CREATE POLICY invoice_lines_insert ON app.invoice_lines FOR INSERT
WITH CHECK (
  app.has_role('owner', 'admin', 'comptable') AND EXISTS (
    SELECT 1 FROM app.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.organization_id = app.current_organization_id()
      AND i.status = 'draft'
  )
);
CREATE POLICY invoice_lines_update ON app.invoice_lines FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM app.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.organization_id = app.current_organization_id()
      AND i.status = 'draft'
      AND (app.is_admin_or_owner() OR app.has_role('comptable'))
  )
);
CREATE POLICY invoice_lines_delete ON app.invoice_lines FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM app.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.organization_id = app.current_organization_id()
      AND i.status = 'draft'
      AND (app.is_admin_or_owner() OR app.has_role('comptable'))
  )
);

-- ── payments ──────────────────────────────────────────────────────
CREATE POLICY payments_select ON app.payments FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
);
CREATE POLICY payments_insert ON app.payments FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id()
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
);

-- ── notifications (admin/comptable) ───────────────────────────────
CREATE POLICY notifications_select ON app.notifications FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_admin_or_owner() OR app.has_role('comptable'))
);

-- ── feature_flags ─────────────────────────────────────────────────
CREATE POLICY feature_flags_select ON app.feature_flags FOR SELECT
USING (
  (organization_id = app.current_organization_id()) OR organization_id IS NULL
);
CREATE POLICY feature_flags_insert ON app.feature_flags FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());
CREATE POLICY feature_flags_update ON app.feature_flags FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id());

-- ── audit.audit_log (read admin/owner) ────────────────────────────
CREATE POLICY audit_log_select ON audit.audit_log FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND app.is_admin_or_owner()
);

-- infra.* : aucune policy → invisible côté client (service_role only)
