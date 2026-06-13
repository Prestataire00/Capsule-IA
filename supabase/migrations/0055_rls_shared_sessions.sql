-- ============================================================================
-- 0055 — RLS partage : un formateur voit une session/feuille partagée s'il est
-- formateur de N'IMPORTE QUEL dossier lié (et plus seulement du dossier primaire).
-- ============================================================================

-- SECURITY DEFINER : lit session_dossiers sans being filtré par sa propre RLS.
CREATE OR REPLACE FUNCTION app.is_session_trainer(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.session_dossiers sd
    WHERE sd.session_id = p_session_id
      AND app.is_dossier_trainer(sd.dossier_id)
  )
$$;
GRANT EXECUTE ON FUNCTION app.is_session_trainer(UUID) TO authenticated;

-- sessions : visibilité formateur via tout dossier lié.
DROP POLICY IF EXISTS sessions_select ON app.sessions;
CREATE POLICY sessions_select ON app.sessions FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable')
       OR (app.has_role('formateur') AND app.is_session_trainer(id)))
);

-- session_participants : idem via la session.
DROP POLICY IF EXISTS session_participants_select ON app.session_participants;
CREATE POLICY session_participants_select ON app.session_participants FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('comptable')
       OR (app.has_role('formateur') AND app.is_session_trainer(session_id)))
);

-- attendance_sheets : feuille partagée (dossier_id NULL) gérée via la session.
DROP POLICY IF EXISTS attendance_sheets_select ON app.attendance_sheets;
CREATE POLICY attendance_sheets_select ON app.attendance_sheets FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff()
       OR (app.has_role('formateur') AND app.is_session_trainer(session_id)))
);

DROP POLICY IF EXISTS attendance_sheets_insert ON app.attendance_sheets;
CREATE POLICY attendance_sheets_insert ON app.attendance_sheets FOR INSERT
WITH CHECK (
  organization_id = app.current_organization_id()
  AND (app.is_staff()
       OR (app.has_role('formateur') AND app.is_session_trainer(session_id)))
);

DROP POLICY IF EXISTS attendance_sheets_update ON app.attendance_sheets;
CREATE POLICY attendance_sheets_update ON app.attendance_sheets FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff()
       OR (app.has_role('formateur') AND app.is_session_trainer(session_id)))
)
WITH CHECK (organization_id = app.current_organization_id());
