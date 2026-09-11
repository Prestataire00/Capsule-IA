-- ════════════════════════════════════════════════════════════════════════════
-- Capsule IA — migrations à appliquer
--
--   0150  espace formateur : le formateur (même externe, non membre de
--         l'organisme) voit SES séances, apprenants, feuilles d'émargement,
--         sa feuille clôturée et son contrat ; liaison fiche ↔ compte réparée
--   0151  espace formateur : questionnaires envoyés par le formateur à ses
--         apprenants, suivi par séance, évaluations anonymes (3 réponses min.)
--
-- Les migrations 0138 à 0149 sont déjà en production. Toutes deux sont
-- rejouables : sans risque si 0150 a déjà été appliquée.
-- À coller dans l'éditeur SQL Supabase, puis « Run ».
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────── 0150_espace_formateur_acces.sql ─────────────

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

-- ───────────── 0151_espace_formateur_questionnaires.sql ─────────────

-- 0151 — Espace formateur : questionnaires envoyés par le formateur, évaluations reçues
--
--  · Une affectation porte la séance et le formateur qui l'a envoyée.
--  · Suivi d'une séance (`my_session_questionnaires`) : pour les tests
--    pédagogiques (positionnement, acquis, personnalisé), le formateur voit le
--    résultat de chaque apprenant ; pour les questionnaires de satisfaction,
--    ni nom, ni réponse, ni score — ils sont annoncés anonymes aux apprenants.
--  · « Mes évaluations » (`my_trainer_evaluations`) : moyennes de satisfaction
--    et note du formateur par formation, et commentaires sans nom, seulement à
--    partir de trois réponses (en deçà, une réponse se reconnaîtrait).
--
-- Rejouable sans risque.

ALTER TABLE app.questionnaire_assignments
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES app.sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_by_trainer_id UUID REFERENCES app.trainers(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.questionnaire_assignments.session_id IS 'Séance pour laquelle le questionnaire a été envoyé (0151).';
COMMENT ON COLUMN app.questionnaire_assignments.sent_by_trainer_id IS 'Formateur qui l''a envoyé depuis son espace (0151).';

CREATE INDEX IF NOT EXISTS questionnaire_assignments_session_idx
  ON app.questionnaire_assignments (session_id) WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.est_satisfaction(p_kind TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('satisfaction_chaud', 'satisfaction_froid', 'satisfaction_formateur')
$$;

-- ── Suivi des questionnaires d'une séance du formateur ─────────────────────
CREATE OR REPLACE FUNCTION app.my_session_questionnaires(p_session_id UUID)
RETURNS TABLE (
  assignment_id UUID,
  template_id UUID,
  template_title TEXT,
  kind TEXT,
  learner_name TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  score NUMERIC,
  answers JSONB,
  questions JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT a.id, t.id, t.title, t.kind::text,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL
              ELSE COALESCE(NULLIF(btrim(concat_ws(' ', l.first_name, l.last_name)), ''), a.recipient_name, 'Apprenant') END,
         a.status::text, a.created_at, r.submitted_at,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE r.score END,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE r.answers END,
         CASE WHEN app.est_satisfaction(t.kind::text) THEN NULL ELSE t.schema -> 'questions' END
    FROM app.questionnaire_assignments a
    JOIN app.questionnaire_templates t ON t.id = a.template_id
    LEFT JOIN app.learners l ON l.id = a.recipient_learner_id
    LEFT JOIN app.questionnaire_responses r ON r.assignment_id = a.id
   WHERE p_session_id IN (SELECT app.my_trainer_session_ids())
     AND a.recipient_kind = 'learner'
     AND (a.session_id = p_session_id
          OR (a.session_id IS NULL AND a.dossier_id IN (
                SELECT s.dossier_id FROM app.sessions s WHERE s.id = p_session_id
                UNION
                SELECT sd.dossier_id FROM app.session_dossiers sd WHERE sd.session_id = p_session_id)))
   ORDER BY 3, 5 NULLS LAST
$$;

-- ── Évaluations reçues par le formateur ────────────────────────────────────
-- Note du formateur : questions « rating » d'une évaluation du formateur, ou
-- dont l'intitulé parle du formateur (satisfaction à chaud, q3), ramenées sur 5.
CREATE OR REPLACE FUNCTION app.my_trainer_evaluations()
RETURNS TABLE (
  formation_id UUID,
  formation_title TEXT,
  responses INT,
  satisfaction_avg NUMERIC,
  trainer_avg NUMERIC,
  last_submitted_at TIMESTAMPTZ,
  comments TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  WITH reponses AS (
    SELECT r.id, r.score, r.answers, r.submitted_at, t.kind::text AS kind, t.schema, d.formation_id
      FROM app.questionnaire_responses r
      JOIN app.questionnaire_assignments a ON a.id = r.assignment_id
      JOIN app.questionnaire_templates t ON t.id = r.template_id
      JOIN app.dossiers d ON d.id = a.dossier_id
     WHERE a.recipient_kind = 'learner'
       AND t.kind::text IN ('satisfaction_chaud', 'satisfaction_formateur')
       AND (a.sent_by_trainer_id IN (SELECT app.my_trainer_ids())
            OR a.session_id IN (SELECT app.my_trainer_session_ids())
            OR a.dossier_id IN (SELECT app.my_trainer_dossier_ids()))
  ),
  notes AS (
    SELECT rep.id,
           avg((rep.answers ->> (q ->> 'id'))::numeric
               / NULLIF(COALESCE(NULLIF(q ->> 'max', '')::numeric, 5), 0) * 5) AS note
      FROM reponses rep
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rep.schema -> 'questions', '[]'::jsonb)) q
     WHERE q ->> 'type' = 'rating'
       AND (rep.kind = 'satisfaction_formateur' OR q ->> 'label' ILIKE '%formateur%')
       AND (rep.answers ->> (q ->> 'id')) ~ '^[0-9]+(\.[0-9]+)?$'
     GROUP BY rep.id
  ),
  textes AS (
    SELECT rep.id, rep.formation_id, rep.submitted_at, btrim(rep.answers ->> (q ->> 'id')) AS texte
      FROM reponses rep
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(rep.schema -> 'questions', '[]'::jsonb)) q
     WHERE q ->> 'type' = 'text'
       AND btrim(COALESCE(rep.answers ->> (q ->> 'id'), '')) <> ''
  ),
  agg AS (
    SELECT rep.formation_id, GROUPING(rep.formation_id) AS global, count(*)::int AS n,
           avg(rep.score) / 20 AS sat, avg(n.note) AS note, max(rep.submitted_at) AS dernier
      FROM reponses rep
      LEFT JOIN notes n ON n.id = rep.id
     GROUP BY GROUPING SETS ((rep.formation_id), ())
    -- Le regroupement total produit une ligne même sans aucune réponse.
    HAVING count(*) > 0
  ),
  com AS (
    SELECT tx.formation_id, array_agg(tx.texte ORDER BY tx.submitted_at DESC) AS commentaires
      FROM textes tx
     GROUP BY tx.formation_id
  )
  SELECT CASE WHEN a.global = 1 THEN NULL ELSE a.formation_id END,
         CASE WHEN a.global = 1 THEN 'Toutes vos formations' ELSE COALESCE(f.title, 'Formation') END,
         a.n,
         CASE WHEN a.n >= 3 THEN round(a.sat, 2) END,
         CASE WHEN a.n >= 3 THEN round(a.note, 2) END,
         a.dernier,
         CASE WHEN a.n >= 3 AND a.global = 0 THEN c.commentaires END
    FROM agg a
    LEFT JOIN com c ON a.global = 0 AND c.formation_id IS NOT DISTINCT FROM a.formation_id
    LEFT JOIN app.formations f ON a.global = 0 AND f.id = a.formation_id
   ORDER BY a.global DESC, a.dernier DESC NULLS LAST
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['app.my_session_questionnaires(uuid)', 'app.my_trainer_evaluations()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
