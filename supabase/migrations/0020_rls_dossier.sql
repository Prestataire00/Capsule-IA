-- ============================================================================
-- 0020 — RLS Dossier (aggregate root)
-- ============================================================================

CREATE POLICY dossiers_select ON app.dossiers FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (
    app.is_staff() OR app.has_role('comptable')
    OR (app.has_role('formateur') AND app.is_dossier_trainer(id))
  )
);

CREATE POLICY dossiers_insert ON app.dossiers FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id()
  AND app.is_staff()
  AND status = 'draft'
);

CREATE POLICY dossiers_update ON app.dossiers FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND app.is_staff()
  AND (
    status NOT IN ('closed', 'archived', 'cancelled')
    OR (status = 'closed' AND app.is_admin_or_owner())
  )
)
WITH CHECK (organization_id = app.current_organization_id());

-- dossier_modules
CREATE POLICY dossier_modules_select ON app.dossier_modules FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND EXISTS (
    SELECT 1 FROM app.dossiers d
    WHERE d.id = dossier_modules.dossier_id
      AND d.deleted_at IS NULL
      AND (
        app.is_staff() OR app.has_role('comptable')
        OR (app.has_role('formateur') AND app.is_dossier_trainer(d.id))
      )
  )
);
CREATE POLICY dossier_modules_insert ON app.dossier_modules FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id() AND app.is_staff()
  AND EXISTS (
    SELECT 1 FROM app.dossiers d
    WHERE d.id = dossier_modules.dossier_id
      AND d.organization_id = app.current_organization_id()
      AND d.status NOT IN ('closed', 'archived', 'cancelled')
  )
);
CREATE POLICY dossier_modules_update ON app.dossier_modules FOR UPDATE
USING (
  organization_id = app.current_organization_id() AND app.is_staff()
  AND EXISTS (
    SELECT 1 FROM app.dossiers d
    WHERE d.id = dossier_modules.dossier_id
      AND d.status NOT IN ('closed', 'archived', 'cancelled')
  )
);
CREATE POLICY dossier_modules_delete ON app.dossier_modules FOR DELETE
USING (
  organization_id = app.current_organization_id() AND app.is_staff()
  AND EXISTS (
    SELECT 1 FROM app.dossiers d
    WHERE d.id = dossier_modules.dossier_id
      AND d.status IN ('draft', 'pending_validation')
  )
);

-- dossier_trainers
CREATE POLICY dossier_trainers_select ON app.dossier_trainers FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff() OR app.has_role('comptable')
    OR (app.has_role('formateur') AND EXISTS (
      SELECT 1 FROM app.trainers t
      WHERE t.id = dossier_trainers.trainer_id AND t.user_id = auth.uid()
    ))
  )
);
CREATE POLICY dossier_trainers_insert ON app.dossier_trainers FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY dossier_trainers_delete ON app.dossier_trainers FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_staff());

-- dossier_funders
CREATE POLICY dossier_funders_select ON app.dossier_funders FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable'))
);
CREATE POLICY dossier_funders_insert ON app.dossier_funders FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY dossier_funders_update ON app.dossier_funders FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY dossier_funders_delete ON app.dossier_funders FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_staff());

-- dossier_status_history (read-only client)
CREATE POLICY dossier_status_history_select ON app.dossier_status_history FOR SELECT
USING (organization_id = app.current_organization_id() AND app.is_staff());

-- dossier_drafts (own only)
CREATE POLICY dossier_drafts_select ON app.dossier_drafts FOR SELECT
USING (organization_id = app.current_organization_id() AND user_id = auth.uid());
CREATE POLICY dossier_drafts_insert ON app.dossier_drafts FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND user_id = auth.uid());
CREATE POLICY dossier_drafts_update ON app.dossier_drafts FOR UPDATE
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dossier_drafts_delete ON app.dossier_drafts FOR DELETE
USING (user_id = auth.uid());
