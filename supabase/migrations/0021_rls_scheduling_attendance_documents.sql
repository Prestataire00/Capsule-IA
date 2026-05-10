-- ============================================================================
-- 0021 — RLS Scheduling, Attendance, Documents
-- ============================================================================

-- ── sessions ──────────────────────────────────────────────────────
CREATE POLICY sessions_select ON app.sessions FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff() OR app.has_role('comptable')
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
);
CREATE POLICY sessions_insert ON app.sessions FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY sessions_update ON app.sessions FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY sessions_delete ON app.sessions FOR DELETE
USING (
  organization_id = app.current_organization_id() AND app.is_staff()
  AND status = 'planned'
);

-- ── session_participants ──────────────────────────────────────────
CREATE POLICY session_participants_select ON app.session_participants FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND EXISTS (
    SELECT 1 FROM app.sessions s
    WHERE s.id = session_participants.session_id
      AND (
        app.is_staff() OR app.has_role('comptable')
        OR (app.has_role('formateur') AND app.is_dossier_trainer(s.dossier_id))
      )
  )
);
CREATE POLICY session_participants_insert ON app.session_participants FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY session_participants_delete ON app.session_participants FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_staff());

-- ── attendance_sheets ─────────────────────────────────────────────
CREATE POLICY attendance_sheets_select ON app.attendance_sheets FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
);
CREATE POLICY attendance_sheets_insert ON app.attendance_sheets FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
);
CREATE POLICY attendance_sheets_update ON app.attendance_sheets FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
)
WITH CHECK (organization_id = app.current_organization_id());

-- ── attendance_signatures (read-only client; writes via Edge Fn service_role)
CREATE POLICY attendance_signatures_select ON app.attendance_signatures FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND EXISTS (
    SELECT 1 FROM app.attendance_sheets s
    WHERE s.id = attendance_signatures.attendance_sheet_id
      AND (
        app.is_staff()
        OR (app.has_role('formateur') AND app.is_dossier_trainer(s.dossier_id))
      )
  )
);

-- ── document_templates / versions ─────────────────────────────────
CREATE POLICY document_templates_select ON app.document_templates FOR SELECT
USING (
  (organization_id = app.current_organization_id() AND deleted_at IS NULL)
  OR (organization_id IS NULL AND is_active)
);
CREATE POLICY document_templates_insert ON app.document_templates FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id() AND app.is_admin_or_owner()
);
CREATE POLICY document_templates_update ON app.document_templates FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY document_template_versions_select ON app.document_template_versions FOR SELECT
USING (
  organization_id = app.current_organization_id() OR organization_id IS NULL
);
CREATE POLICY document_template_versions_insert ON app.document_template_versions FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id() AND app.is_admin_or_owner()
);

-- ── documents (writes via Edge Fn service_role en pratique) ──────
CREATE POLICY documents_select ON app.documents FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (
    app.is_staff() OR app.has_role('comptable')
    OR (
      app.has_role('formateur') AND dossier_id IS NOT NULL
      AND app.is_dossier_trainer(dossier_id)
    )
  )
);
CREATE POLICY documents_insert ON app.documents FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id() AND app.is_staff()
);

-- ── document_signatures (read-only client) ───────────────────────
CREATE POLICY document_signatures_select ON app.document_signatures FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND EXISTS (
    SELECT 1 FROM app.documents d
    WHERE d.id = document_signatures.document_id
      AND (
        app.is_staff() OR app.has_role('comptable')
        OR (app.has_role('formateur') AND d.dossier_id IS NOT NULL
            AND app.is_dossier_trainer(d.dossier_id))
      )
  )
);

-- ── document_access_log (admin only) ──────────────────────────────
CREATE POLICY document_access_log_select ON app.document_access_log FOR SELECT
USING (
  organization_id = app.current_organization_id() AND app.is_admin_or_owner()
);
