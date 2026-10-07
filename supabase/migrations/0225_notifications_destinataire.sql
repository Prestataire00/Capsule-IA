-- Chacun ne voit que les notifications de l'organisme qui ne visent personne
-- en particulier, et les siennes (constat d'Ismael le 2026-10-07 : un message
-- client prévenant trois personnes apparaissait trois fois dans chaque cloche,
-- et un message direct ou une mention se lisait dans la cloche des collègues).

DROP POLICY IF EXISTS notifications_select ON app.notifications;
CREATE POLICY notifications_select ON app.notifications FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable'))
  AND (recipient_user_id IS NULL OR recipient_user_id = auth.uid())
);
