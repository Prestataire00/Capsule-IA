-- 0186 — Une séance ajoutée après les apprenants n'attendait personne
--
-- Constat (recette de bout en bout du 20/09/2026, reproduit en base) :
--   1. l'admin crée le dossier et y rattache trois stagiaires ;
--   2. il ajoute une séance ;
--   3. `session_participants` reste vide et la feuille d'émargement n'attend
--      qu'UNE personne, le titulaire. Aucune convocation ne part pour cette
--      séance, et elle n'apparaît dans l'espace d'aucun stagiaire.
--
-- Deux causes, toutes deux antérieures à la 0175 qui a introduit le groupe
-- d'apprenants du dossier (`app.dossier_learners`) sans mettre à jour ce qui
-- lisait l'ancien modèle « un dossier = un apprenant » :
--
--   · `app.derive_session_attendees` (0054) ne regardait que la table de
--     liaison `session_dossiers`. Or une séance créée DEPUIS un dossier porte
--     son `sessions.dossier_id` et n'a aucune ligne de liaison : la dérivation
--     ne trouvait rien du tout. C'est pourtant elle qu'appelle
--     `session-actions.ts` juste après la création.
--
--   · `app.session_expected_signers` (0145) ajoutait le seul
--     `dossiers.learner_id`. D'où l'unique signataire attendu — et, sur un
--     dossier importé d'une convention, ce titulaire est le stagiaire
--     provisoire « à désigner » : la feuille portait un nom fictif.
--
-- Correction minimale : les deux fonctions lisent les mêmes apprenants, par la
-- même règle — le groupe du dossier s'il existe, le titulaire sinon. Le
-- titulaire reste le repli des dossiers antérieurs à la 0175 ; dès qu'un groupe
-- existe, il cesse d'être compté, ce qui écarte le titulaire provisoire des
-- dossiers importés.
--
-- Tout le reste de `session_expected_signers` est repris à l'identique de la
-- 0145 — notamment les formateurs, qui viennent de `app.dossier_trainers` et
-- non des formateurs de séance. La fenêtre de dates du dossier est conservée :
-- un stagiaire n'est attendu qu'entre son entrée et sa sortie.
--
-- Rejouable sans risque.

-- ── 1. Apprenants d'un dossier : le groupe, sinon le titulaire ──────────────
CREATE OR REPLACE FUNCTION app.dossier_apprenants(p_dossier_id UUID)
RETURNS TABLE(learner_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT dl.learner_id
    FROM app.dossier_learners dl
   WHERE dl.dossier_id = p_dossier_id
  UNION
  SELECT d.learner_id
    FROM app.dossiers d
   WHERE d.id = p_dossier_id
     AND d.learner_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM app.dossier_learners dl2 WHERE dl2.dossier_id = p_dossier_id)
$$;

COMMENT ON FUNCTION app.dossier_apprenants(UUID) IS
  'Apprenants d''un dossier : le groupe (app.dossier_learners, 0175) s''il existe, sinon le titulaire seul — repli des dossiers antérieurs. Source unique de la dérivation des participants et des signataires attendus.';

-- ── 2. Dossiers d'une séance : liaison ET rattachement direct ───────────────
CREATE OR REPLACE FUNCTION app.session_dossier_ids(p_session_id UUID)
RETURNS TABLE(dossier_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT s.dossier_id
    FROM app.sessions s
   WHERE s.id = p_session_id AND s.dossier_id IS NOT NULL
  UNION
  SELECT sd.dossier_id
    FROM app.session_dossiers sd
   WHERE sd.session_id = p_session_id
$$;

COMMENT ON FUNCTION app.session_dossier_ids(UUID) IS
  'Dossiers d''une séance : le rattachement direct (sessions.dossier_id) ET la table de liaison (session_dossiers, séances de groupe). Ne regarder que la seconde laissait sans participants toute séance créée depuis un dossier.';

-- ── 3. La dérivation utilise les deux ───────────────────────────────────────
CREATE OR REPLACE FUNCTION app.derive_session_attendees(p_session_id UUID)
RETURNS TABLE(learner_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT DISTINCT a.learner_id
    FROM app.session_dossier_ids(p_session_id) sdi
    JOIN app.dossiers d ON d.id = sdi.dossier_id AND d.deleted_at IS NULL
    JOIN app.sessions s ON s.id = p_session_id
   CROSS JOIN LATERAL app.dossier_apprenants(d.id) a
   WHERE s.starts_at::date BETWEEN d.start_date AND d.end_date
$$;

-- ── 4. Signataires attendus : corps de la 0145, apprenants corrigés ─────────
CREATE OR REPLACE FUNCTION app.session_expected_signers(p_session_id UUID)
RETURNS TABLE (participant_kind TEXT, participant_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH dossiers_session AS (
    SELECT sdi.dossier_id AS id FROM app.session_dossier_ids(p_session_id) sdi
  ),
  retires AS (
    SELECT sp.participant_kind, sp.participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.source = 'manual_remove'
  ),
  candidats AS (
    SELECT 'learner'::text AS participant_kind, sp.learner_id AS participant_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'learner' AND sp.source <> 'manual_remove'
    UNION
    -- Le groupe du dossier remplace ici le seul titulaire (0175).
    SELECT 'learner', a.learner_id
    FROM dossiers_session ds
    JOIN app.dossiers d ON d.id = ds.id AND d.deleted_at IS NULL
    CROSS JOIN LATERAL app.dossier_apprenants(d.id) a
    UNION
    SELECT 'learner', a.learner_id FROM app.derive_session_attendees(p_session_id) a
    UNION
    SELECT 'trainer', sp.trainer_id
    FROM app.session_participants sp
    WHERE sp.session_id = p_session_id AND sp.participant_kind = 'trainer' AND sp.source <> 'manual_remove'
    UNION
    SELECT 'trainer', dt.trainer_id
    FROM app.dossier_trainers dt
    WHERE dt.dossier_id IN (SELECT id FROM dossiers_session)
  )
  SELECT c.participant_kind, c.participant_id
  FROM candidats c
  WHERE c.participant_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM retires r
      WHERE r.participant_kind = c.participant_kind AND r.participant_id = c.participant_id)
$$;

REVOKE ALL ON FUNCTION app.dossier_apprenants(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app.session_dossier_ids(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.dossier_apprenants(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION app.session_dossier_ids(UUID) TO service_role;
