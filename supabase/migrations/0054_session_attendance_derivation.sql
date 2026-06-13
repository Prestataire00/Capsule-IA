-- ============================================================================
-- 0054 — Dérivation des présences (fenêtre dossier) + matérialisation
-- ============================================================================

-- Apprenants attendus à une session : pour chaque dossier lié, son apprenant
-- si la date de session tombe dans la fenêtre du dossier (entrées/sorties décalées).
CREATE OR REPLACE FUNCTION app.derive_session_attendees(p_session_id UUID)
RETURNS TABLE(learner_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT d.learner_id
  FROM app.session_dossiers sd
  JOIN app.dossiers d  ON d.id = sd.dossier_id
  JOIN app.sessions  s ON s.id = sd.session_id
  WHERE sd.session_id = p_session_id
    AND s.starts_at::date BETWEEN d.start_date AND d.end_date
$$;

-- Matérialise les participants : upsert les 'derived', sans toucher les manuels ;
-- purge les 'derived' qui ne le sont plus. Présents effectifs = source <> 'manual_remove'.
CREATE OR REPLACE FUNCTION app.materialize_session_participants(p_session_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE v_org UUID; v_count INT;
BEGIN
  SELECT organization_id INTO v_org FROM app.sessions WHERE id = p_session_id;
  IF v_org IS NULL THEN RETURN 0; END IF;

  -- Ajoute les dérivés manquants (un manual_remove existant gagne via le PK -> DO NOTHING).
  INSERT INTO app.session_participants
    (session_id, organization_id, participant_kind, learner_id, source)
  SELECT p_session_id, v_org, 'learner', da.learner_id, 'derived'
  FROM app.derive_session_attendees(p_session_id) da
  ON CONFLICT (session_id, participant_kind, participant_id) DO NOTHING;

  -- Retire les lignes 'derived' qui ne sont plus dérivées (ne touche pas les manuels).
  DELETE FROM app.session_participants sp
  WHERE sp.session_id = p_session_id
    AND sp.participant_kind = 'learner'
    AND sp.source = 'derived'
    AND sp.learner_id NOT IN (SELECT learner_id FROM app.derive_session_attendees(p_session_id));

  SELECT count(*)::int INTO v_count
  FROM app.session_participants
  WHERE session_id = p_session_id AND participant_kind = 'learner' AND source <> 'manual_remove';
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION app.derive_session_attendees(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.materialize_session_participants(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.derive_session_attendees(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.materialize_session_participants(UUID) TO service_role;

-- Wrapper public pour exposition PostgREST (cron via rpc()).
CREATE OR REPLACE FUNCTION public.materialize_session_participants(p_session_id UUID)
RETURNS INT
LANGUAGE sql SECURITY DEFINER SET search_path = app, public
AS $$ SELECT app.materialize_session_participants(p_session_id) $$;

REVOKE ALL ON FUNCTION public.materialize_session_participants(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.materialize_session_participants(UUID) TO service_role;
