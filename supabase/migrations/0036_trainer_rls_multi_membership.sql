-- supabase/migrations/0036_trainer_rls_multi_membership.sql
-- ============================================================================
-- 0036 — RLS self-access pour formateur multi-OF
-- ============================================================================
-- Policies ADDITIVES (OR avec policies admin existantes de 0019).
-- Le trainer authentifié peut SELECT/UPDATE sa propre fiche (cross-OF) et
-- CRUD ses compétences. Les champs admin-only sont protégés par le trigger
-- trainers_self_edit_guard (cf. 0029_trainer_multi_membership.sql).

-- ── app.trainers ────────────────────────────────────────────────────────────

CREATE POLICY trainers_self_select ON app.trainers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY trainers_self_update ON app.trainers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- ── app.trainer_competencies ────────────────────────────────────────────────

CREATE POLICY trainer_comps_self_select ON app.trainer_competencies
  FOR SELECT TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY trainer_comps_self_insert ON app.trainer_competencies
  FOR INSERT TO authenticated
  WITH CHECK (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY trainer_comps_self_update ON app.trainer_competencies
  FOR UPDATE TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ))
  WITH CHECK (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY trainer_comps_self_delete ON app.trainer_competencies
  FOR DELETE TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));
