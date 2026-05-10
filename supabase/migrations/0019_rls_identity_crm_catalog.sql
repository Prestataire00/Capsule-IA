-- ============================================================================
-- 0019 — RLS Identity + CRM + Catalog
-- ============================================================================

-- ── organizations ─────────────────────────────────────────────────
CREATE POLICY org_select ON app.organizations FOR SELECT
USING (id = app.current_organization_id() AND deleted_at IS NULL);
CREATE POLICY org_update ON app.organizations FOR UPDATE
USING (id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (id = app.current_organization_id() AND app.is_admin_or_owner());

-- ── profiles ──────────────────────────────────────────────────────
CREATE POLICY profile_select ON app.profiles FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM app.members m1, app.members m2
    WHERE m1.user_id = auth.uid()
      AND m2.user_id = app.profiles.user_id
      AND m1.organization_id = m2.organization_id
      AND m1.organization_id = app.current_organization_id()
      AND m1.deleted_at IS NULL AND m2.deleted_at IS NULL
  )
);
CREATE POLICY profile_insert ON app.profiles FOR INSERT
WITH CHECK (user_id = auth.uid());
CREATE POLICY profile_update ON app.profiles FOR UPDATE
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── members ───────────────────────────────────────────────────────
CREATE POLICY members_select ON app.members FOR SELECT
USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
CREATE POLICY members_insert ON app.members FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id() AND app.is_admin_or_owner()
);
CREATE POLICY members_update ON app.members FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND app.is_admin_or_owner()
  AND (role <> 'owner' OR user_id = auth.uid())
)
WITH CHECK (
  organization_id = app.current_organization_id()
  AND (role <> 'owner' OR user_id = auth.uid())
);

-- ── invitations ───────────────────────────────────────────────────
CREATE POLICY invitations_select ON app.invitations FOR SELECT
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());
CREATE POLICY invitations_insert ON app.invitations FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id()
  AND app.is_admin_or_owner()
  AND invited_by = auth.uid()
);
CREATE POLICY invitations_update ON app.invitations FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id());

-- ── companies ─────────────────────────────────────────────────────
CREATE POLICY companies_select ON app.companies FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (app.is_staff() OR app.has_role('comptable'))
);
CREATE POLICY companies_insert ON app.companies FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY companies_update ON app.companies FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- ── contacts ──────────────────────────────────────────────────────
CREATE POLICY contacts_select ON app.contacts FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (app.is_staff() OR app.has_role('comptable'))
);
CREATE POLICY contacts_insert ON app.contacts FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY contacts_update ON app.contacts FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- ── learners ──────────────────────────────────────────────────────
CREATE POLICY learners_select ON app.learners FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (
    app.is_staff() OR app.has_role('comptable')
    OR (
      app.has_role('formateur') AND EXISTS (
        SELECT 1 FROM app.dossiers d
        JOIN app.dossier_trainers dt ON dt.dossier_id = d.id
        JOIN app.trainers t ON t.id = dt.trainer_id
        WHERE d.learner_id = app.learners.id
          AND t.user_id = auth.uid()
          AND d.organization_id = app.current_organization_id()
      )
    )
  )
);
CREATE POLICY learners_insert ON app.learners FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY learners_update ON app.learners FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

-- ── catalog (formations, modules, formation_modules) ──────────────
CREATE POLICY formations_select ON app.formations FOR SELECT
USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
CREATE POLICY formations_insert ON app.formations FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY formations_update ON app.formations FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY modules_select ON app.modules FOR SELECT
USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);
CREATE POLICY modules_insert ON app.modules FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY modules_update ON app.modules FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY formation_modules_select ON app.formation_modules FOR SELECT
USING (EXISTS (
  SELECT 1 FROM app.formations f
  WHERE f.id = formation_modules.formation_id
    AND f.organization_id = app.current_organization_id()
    AND f.deleted_at IS NULL
));
CREATE POLICY formation_modules_insert ON app.formation_modules FOR INSERT
WITH CHECK (
  app.is_staff() AND EXISTS (
    SELECT 1 FROM app.formations f
    WHERE f.id = formation_modules.formation_id
      AND f.organization_id = app.current_organization_id()
  )
);
CREATE POLICY formation_modules_update ON app.formation_modules FOR UPDATE
USING (
  app.is_staff() AND EXISTS (
    SELECT 1 FROM app.formations f
    WHERE f.id = formation_modules.formation_id
      AND f.organization_id = app.current_organization_id()
  )
);
CREATE POLICY formation_modules_delete ON app.formation_modules FOR DELETE
USING (
  app.is_staff() AND EXISTS (
    SELECT 1 FROM app.formations f
    WHERE f.id = formation_modules.formation_id
      AND f.organization_id = app.current_organization_id()
  )
);

-- ── trainers / trainer_competencies / funders ─────────────────────
CREATE POLICY trainers_select ON app.trainers FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (app.is_staff() OR app.has_role('comptable') OR app.has_role('formateur'))
);
CREATE POLICY trainers_insert ON app.trainers FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY trainers_update ON app.trainers FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY trainer_competencies_select ON app.trainer_competencies FOR SELECT
USING (organization_id = app.current_organization_id());
CREATE POLICY trainer_competencies_insert ON app.trainer_competencies FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY trainer_competencies_update ON app.trainer_competencies FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY trainer_competencies_delete ON app.trainer_competencies FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_staff());

CREATE POLICY funders_select ON app.funders FOR SELECT
USING (
  organization_id = app.current_organization_id() AND deleted_at IS NULL
  AND (app.is_staff() OR app.has_role('comptable'))
);
CREATE POLICY funders_insert ON app.funders FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
CREATE POLICY funders_update ON app.funders FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
