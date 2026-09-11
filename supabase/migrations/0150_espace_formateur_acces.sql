-- 0150 — Espace formateur : le formateur accède à SES séances, sans être membre
--
-- Constat : toutes les politiques de lecture exigeaient l'organisme de la
-- session (`current_organization_id()`), qui n'est renseigné que pour un
-- MEMBRE de l'organisme. Un formateur externe (fiche formateur reliée à son
-- compte, sans rôle interne) ne voyait donc ni ses séances, ni ses apprenants,
-- ni ses feuilles d'émargement : « Mes sessions » était vide et l'émargement
-- introuvable.
--
--  · Fonctions « mes … » (SECURITY DEFINER, clé : trainers.user_id = auth.uid(),
--    fiche active et espace ouvert) : séances, dossiers, apprenants,
--    formations, feuilles du formateur connecté.
--  · Politiques de LECTURE ajoutées (elles s'additionnent aux politiques
--    existantes, qui ne changent pas). Les écritures passent par les actions
--    serveur gardées (`features/attendance/access.ts`).
--  · `link_my_trainer_rows` : sans type `citext` (non résolu selon le schéma de
--    l'extension), sans violer l'unicité (un compte, une fiche par organisme),
--    adresse confirmée seulement. Elle faisait planter l'espace formateur.
--
-- Rejouable sans risque.

-- ── 1. Fonctions « mes … » ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.uuid_ou_null(p TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN p::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION app.my_trainer_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT t.id FROM app.trainers t
   WHERE auth.uid() IS NOT NULL
     AND t.user_id = auth.uid()
     AND t.deleted_at IS NULL
     AND t.space_disabled_at IS NULL
$$;

-- Séances d'un utilisateur formateur : participant formateur, formateur de la
-- séance, ou formateur d'un dossier de la séance (direct ou de groupe).
CREATE OR REPLACE FUNCTION app.trainer_session_ids(p_user_id UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH mes AS (
    SELECT t.id FROM app.trainers t
     WHERE p_user_id IS NOT NULL AND t.user_id = p_user_id
       AND t.deleted_at IS NULL AND t.space_disabled_at IS NULL
  )
  SELECT sp.session_id FROM app.session_participants sp
   WHERE sp.participant_kind = 'trainer' AND sp.trainer_id IN (SELECT id FROM mes)
  UNION
  SELECT st.session_id FROM app.session_trainers st
   WHERE st.deleted_at IS NULL AND st.trainer_id IN (SELECT id FROM mes)
  UNION
  SELECT sd.session_id FROM app.session_dossiers sd
    JOIN app.dossier_trainers dt ON dt.dossier_id = sd.dossier_id
   WHERE dt.trainer_id IN (SELECT id FROM mes)
  UNION
  SELECT s.id FROM app.sessions s
    JOIN app.dossier_trainers dt ON dt.dossier_id = s.dossier_id
   WHERE dt.trainer_id IN (SELECT id FROM mes)
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_session_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT app.trainer_session_ids(auth.uid())
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_dossier_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH seances AS (SELECT app.trainer_session_ids(auth.uid()) AS id)
  SELECT dt.dossier_id FROM app.dossier_trainers dt
   WHERE dt.trainer_id IN (SELECT app.my_trainer_ids())
  UNION
  SELECT sd.dossier_id FROM app.session_dossiers sd
   WHERE sd.session_id IN (SELECT id FROM seances)
  UNION
  SELECT s.dossier_id FROM app.sessions s
   WHERE s.dossier_id IS NOT NULL AND s.id IN (SELECT id FROM seances)
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_learner_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT d.learner_id FROM app.dossiers d
   WHERE d.deleted_at IS NULL AND d.learner_id IS NOT NULL
     AND d.id IN (SELECT app.my_trainer_dossier_ids())
  UNION
  SELECT sp.learner_id FROM app.session_participants sp
   WHERE sp.participant_kind = 'learner'
     AND sp.session_id IN (SELECT app.trainer_session_ids(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_formation_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT s.formation_id FROM app.sessions s
   WHERE s.formation_id IS NOT NULL AND s.id IN (SELECT app.trainer_session_ids(auth.uid()))
  UNION
  SELECT d.formation_id FROM app.dossiers d
   WHERE d.formation_id IS NOT NULL AND d.id IN (SELECT app.my_trainer_dossier_ids())
$$;

CREATE OR REPLACE FUNCTION app.my_trainer_sheet_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT sh.id FROM app.attendance_sheets sh
   WHERE sh.session_id IN (SELECT app.trainer_session_ids(auth.uid()))
$$;

-- ── 2. Lecture : séances, apprenants, feuilles du formateur ─────────────────
DROP POLICY IF EXISTS sessions_formateur_espace ON app.sessions;
CREATE POLICY sessions_formateur_espace ON app.sessions
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS session_participants_formateur_espace ON app.session_participants;
CREATE POLICY session_participants_formateur_espace ON app.session_participants
  FOR SELECT TO authenticated USING (session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS session_dossiers_formateur_espace ON app.session_dossiers;
CREATE POLICY session_dossiers_formateur_espace ON app.session_dossiers
  FOR SELECT TO authenticated USING (session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS session_trainers_formateur_espace ON app.session_trainers;
CREATE POLICY session_trainers_formateur_espace ON app.session_trainers
  FOR SELECT TO authenticated USING (trainer_id IN (SELECT app.my_trainer_ids()));

DROP POLICY IF EXISTS dossier_trainers_formateur_espace ON app.dossier_trainers;
CREATE POLICY dossier_trainers_formateur_espace ON app.dossier_trainers
  FOR SELECT TO authenticated USING (trainer_id IN (SELECT app.my_trainer_ids()));

DROP POLICY IF EXISTS dossiers_formateur_espace ON app.dossiers;
CREATE POLICY dossiers_formateur_espace ON app.dossiers
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_dossier_ids()));

DROP POLICY IF EXISTS learners_formateur_espace ON app.learners;
CREATE POLICY learners_formateur_espace ON app.learners
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_learner_ids()));

DROP POLICY IF EXISTS formations_formateur_espace ON app.formations;
CREATE POLICY formations_formateur_espace ON app.formations
  FOR SELECT TO authenticated USING (id IN (SELECT app.my_trainer_formation_ids()));

DROP POLICY IF EXISTS attendance_sheets_formateur_espace ON app.attendance_sheets;
CREATE POLICY attendance_sheets_formateur_espace ON app.attendance_sheets
  FOR SELECT TO authenticated USING (session_id IN (SELECT app.my_trainer_session_ids()));

DROP POLICY IF EXISTS attendance_signatures_formateur_espace ON app.attendance_signatures;
CREATE POLICY attendance_signatures_formateur_espace ON app.attendance_signatures
  FOR SELECT TO authenticated USING (attendance_sheet_id IN (SELECT app.my_trainer_sheet_ids()));

DROP POLICY IF EXISTS attendance_justifications_formateur_espace ON app.attendance_justifications;
CREATE POLICY attendance_justifications_formateur_espace ON app.attendance_justifications
  FOR SELECT TO authenticated USING (attendance_sheet_id IN (SELECT app.my_trainer_sheet_ids()));

-- Documents : feuilles clôturées de ses séances, et son contrat.
DROP POLICY IF EXISTS documents_formateur_espace ON app.documents;
CREATE POLICY documents_formateur_espace ON app.documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (kind = 'feuille_emargement_signee'
        AND app.uuid_ou_null(metadata ->> 'session_id') IN (SELECT app.my_trainer_session_ids()))
      OR (kind = 'trainer_contract'
        AND app.uuid_ou_null(metadata ->> 'trainer_id') IN (SELECT app.my_trainer_ids()))
    )
  );

-- ── 3. Liaison fiche ↔ compte, sans planter ─────────────────────────────────
CREATE OR REPLACE FUNCTION app.link_my_trainer_rows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_email TEXT;
  v_count INTEGER;
BEGIN
  SELECT lower(u.email::text) INTO v_email
    FROM auth.users u
   WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN 0; END IF;

  UPDATE app.trainers t
     SET user_id = auth.uid(), updated_at = now()
   WHERE lower(t.email::text) = v_email
     AND t.user_id IS NULL
     AND t.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM app.trainers o
        WHERE o.user_id = auth.uid() AND o.organization_id = t.organization_id AND o.deleted_at IS NULL);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ── 4. Droits ───────────────────────────────────────────────────────────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'app.my_trainer_ids()', 'app.my_trainer_session_ids()', 'app.my_trainer_dossier_ids()',
    'app.my_trainer_learner_ids()', 'app.my_trainer_formation_ids()', 'app.my_trainer_sheet_ids()',
    'app.link_my_trainer_rows()', 'app.uuid_ou_null(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  -- Séances d'un utilisateur quelconque : réservé au serveur (flux calendrier).
  REVOKE ALL ON FUNCTION app.trainer_session_ids(UUID) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION app.trainer_session_ids(UUID) TO service_role;
END $$;

NOTIFY pgrst, 'reload schema';
