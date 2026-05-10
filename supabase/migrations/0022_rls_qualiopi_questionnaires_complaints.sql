-- ============================================================================
-- 0022 — RLS Qualiopi, Questionnaires, Complaints
-- ============================================================================

-- ── qualiopi_indicators (référentiel public auth) ────────────────
CREATE POLICY qualiopi_indicators_select ON app.qualiopi_indicators FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ── qualiopi_proofs ───────────────────────────────────────────────
CREATE POLICY qualiopi_proofs_select ON app.qualiopi_proofs FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND scope = 'dossier'
        AND dossier_id IS NOT NULL AND app.is_dossier_trainer(dossier_id))
  )
);
CREATE POLICY qualiopi_proofs_insert ON app.qualiopi_proofs FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY qualiopi_proofs_update ON app.qualiopi_proofs FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY qualiopi_proofs_delete ON app.qualiopi_proofs FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

-- ── qualiopi_dossier_checklists (snapshot calculé par cron) ──────
CREATE POLICY qualiopi_checklists_select ON app.qualiopi_dossier_checklists FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
);

-- ── questionnaire_templates ──────────────────────────────────────
CREATE POLICY questionnaire_templates_select ON app.questionnaire_templates FOR SELECT
USING (
  (organization_id = app.current_organization_id() AND deleted_at IS NULL)
  OR organization_id IS NULL
);
CREATE POLICY questionnaire_templates_insert ON app.questionnaire_templates FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());
CREATE POLICY questionnaire_templates_update ON app.questionnaire_templates FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id());

-- ── questionnaire_assignments ────────────────────────────────────
CREATE POLICY questionnaire_assignments_select ON app.questionnaire_assignments FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
);
CREATE POLICY questionnaire_assignments_insert ON app.questionnaire_assignments FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY questionnaire_assignments_update ON app.questionnaire_assignments FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff());

-- ── questionnaire_responses (writes via Edge Fn) ─────────────────
CREATE POLICY questionnaire_responses_select ON app.questionnaire_responses FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (
    app.is_staff()
    OR (app.has_role('formateur') AND app.is_dossier_trainer(dossier_id))
  )
);

-- ── complaints ────────────────────────────────────────────────────
CREATE POLICY complaints_select ON app.complaints FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND app.is_admin_or_owner()
);
CREATE POLICY complaints_insert ON app.complaints FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY complaints_update ON app.complaints FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id());

CREATE POLICY complaint_events_select ON app.complaint_events FOR SELECT
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());
CREATE POLICY complaint_events_insert ON app.complaint_events FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());
