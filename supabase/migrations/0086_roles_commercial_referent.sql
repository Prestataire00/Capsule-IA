-- ============================================================================
-- 0086 — Matrice des rôles (4.1) : rôles 'commercial' et 'referent'
-- ============================================================================
-- Spec 4.1 :
--   - Commercial (Ismaël) : accès pipeline / dossiers / finances → niveau staff
--     → ajouté à app.is_staff() (lecture + écriture comme gestionnaire).
--   - Référente métier (Laurie) : dossiers / Qualiopi / reporting en LECTURE seule
--     → policies SELECT ADDITIVES (permissives, OR-combinées) sur les tables
--       concernées ; aucune policy d'écriture → read-only strict.
-- Les helpers/policies comparent app.current_role() (TEXT du JWT) : pas de
-- littéral enum utilisé ici → sûr dans la même migration que ADD VALUE.
-- is_admin_or_owner() reste inchangé (commercial n'est PAS admin).

ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'commercial';
ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'referent';

-- Commercial = staff (pipeline/dossiers/finances en lecture/écriture).
CREATE OR REPLACE FUNCTION app.is_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT app.current_role() IN ('owner', 'admin', 'gestionnaire', 'commercial');
$$;

-- ---------------------------------------------------------------------------
-- Référente (lecture seule) : policies SELECT additives, scopées à l'org.
-- ---------------------------------------------------------------------------
CREATE POLICY dossiers_referent_read ON app.dossiers FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL AND app.has_role('referent'));

CREATE POLICY prospects_referent_read ON app.prospects FOR SELECT TO authenticated
  USING ((organization_id = app.current_organization_id() OR organization_id IS NULL) AND deleted_at IS NULL AND app.has_role('referent'));

CREATE POLICY invoices_referent_read ON app.invoices FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL AND app.has_role('referent'));

CREATE POLICY complaints_referent_read ON app.complaints FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL AND app.has_role('referent'));

CREATE POLICY qualiopi_checklists_referent_read ON app.qualiopi_dossier_checklists FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.has_role('referent'));

CREATE POLICY hours_referent_read ON app.dossier_hours_tracking FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.has_role('referent'));

CREATE POLICY q_assignments_referent_read ON app.questionnaire_assignments FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.has_role('referent'));

CREATE POLICY q_responses_referent_read ON app.questionnaire_responses FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.has_role('referent'));
