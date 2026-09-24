-- Des groupes d'apprenants dans un dossier, et des séances qui s'y rattachent.
--
-- Une entreprise forme seize personnes en deux groupes de huit, qui ne viennent
-- pas les mêmes demi-journées. Jusqu'ici, le groupe n'existait que dans le
-- TITRE de la séance — « Groupe A (matin) — 28/09/2026 », posé par l'import de
-- la convention. Du texte : rien ne savait qui était dans quel groupe. Les
-- seize stagiaires étaient donc attendus sur les deux séances, et leurs
-- feuilles d'émargement les listaient tous.
--
-- Demande d'Ismael le 2026-09-24.
--
-- Le groupe est porté par le DOSSIER, pas par l'organisme : il dit comment ce
-- client-là répartit ses salariés, et n'a pas de sens ailleurs. Une séance s'y
-- rattache ou non — sans groupe, elle concerne tout le dossier, ce qui reste le
-- cas courant et n'exige aucune reprise de l'existant.

-- ── 1. Les groupes d'un dossier ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.dossier_groupes (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  dossier_id       UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  nom              TEXT        NOT NULL CHECK (btrim(nom) <> ''),
  -- L'ordre d'affichage : « Groupe A » avant « Groupe B », quel que soit
  -- l'ordre de création ou l'alphabet.
  ordre            SMALLINT    NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES auth.users(id),
  -- Deux « Groupe A » dans le même dossier ne se distingueraient pas à l'œil.
  UNIQUE (dossier_id, nom)
);

CREATE INDEX IF NOT EXISTS ix_dossier_groupes_dossier ON app.dossier_groupes (dossier_id);
CREATE INDEX IF NOT EXISTS ix_dossier_groupes_org ON app.dossier_groupes (organization_id);

-- ── 2. Qui est dans quel groupe ─────────────────────────────────────────────
--
-- Une table de liaison, et non une colonne sur `dossier_learners` : Ismael
-- choisit lui-même la répartition, et rien ne doit l'empêcher de mettre un
-- stagiaire dans deux groupes — le tronc commun avec l'un, un module avec
-- l'autre. Les dérivations dédoublonnent déjà (UNION, DISTINCT) : personne ne
-- sera compté deux fois dans les effectifs ni au BPF.
CREATE TABLE IF NOT EXISTS app.dossier_groupe_membres (
  groupe_id        UUID        NOT NULL REFERENCES app.dossier_groupes(id) ON DELETE CASCADE,
  learner_id       UUID        NOT NULL REFERENCES app.learners(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (groupe_id, learner_id)
);

CREATE INDEX IF NOT EXISTS ix_dossier_groupe_membres_learner ON app.dossier_groupe_membres (learner_id);
CREATE INDEX IF NOT EXISTS ix_dossier_groupe_membres_org ON app.dossier_groupe_membres (organization_id);

-- ── 3. La séance peut viser un groupe ───────────────────────────────────────
ALTER TABLE app.sessions
  ADD COLUMN IF NOT EXISTS groupe_id UUID REFERENCES app.dossier_groupes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sessions_groupe ON app.sessions (groupe_id) WHERE groupe_id IS NOT NULL;

COMMENT ON COLUMN app.sessions.groupe_id IS
  'Groupe du dossier concerné par cette séance. NULL = tout le dossier, cas courant. Supprimer le groupe ne supprime pas la séance : elle redevient celle de tout le dossier.';

-- ── 4. RLS : la même règle que `dossier_learners` (0175) ────────────────────
ALTER TABLE app.dossier_groupes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_groupes FORCE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_groupe_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_groupe_membres FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dossier_groupes_select ON app.dossier_groupes;
CREATE POLICY dossier_groupes_select ON app.dossier_groupes FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    OR dossier_id IN (SELECT app.my_trainer_dossier_ids())
  );

DROP POLICY IF EXISTS dossier_groupes_write ON app.dossier_groupes;
CREATE POLICY dossier_groupes_write ON app.dossier_groupes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Le formateur voit les membres d'un groupe de SES dossiers : c'est ce qui lui
-- dit qui il attend en salle.
DROP POLICY IF EXISTS dossier_groupe_membres_select ON app.dossier_groupe_membres;
CREATE POLICY dossier_groupe_membres_select ON app.dossier_groupe_membres FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    OR groupe_id IN (
      SELECT g.id FROM app.dossier_groupes g
      WHERE g.dossier_id IN (SELECT app.my_trainer_dossier_ids())
    )
  );

DROP POLICY IF EXISTS dossier_groupe_membres_write ON app.dossier_groupe_membres;
CREATE POLICY dossier_groupe_membres_write ON app.dossier_groupe_membres FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 5. Les apprenants d'une séance tiennent compte du groupe ────────────────
--
-- Corps de la 0186, avec une seule clause de plus. `dossier_apprenants` garde
-- sa signature à un argument : ajouter un paramètre en aurait fait une seconde
-- fonction du même nom, et tout appel à un argument serait devenu ambigu
-- (« function is not unique »). Le filtre appartient de toute façon à la
-- séance, qui seule connaît son groupe.
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
     AND (
       s.groupe_id IS NULL
       OR EXISTS (
         SELECT 1 FROM app.dossier_groupe_membres m
          WHERE m.groupe_id = s.groupe_id AND m.learner_id = a.learner_id
       )
     )
$$;

-- ── 6. Et les signataires attendus aussi ────────────────────────────────────
--
-- Sans cette reprise, la séance aurait bien été réduite au groupe mais sa
-- feuille d'émargement aurait continué de lister tout le monde : cette fonction
-- ajoute les apprenants du dossier par une branche qui lui est propre, sans
-- passer par `derive_session_attendees`. Le filtre doit donc être posé deux
-- fois — c'est le prix de deux chemins, et l'oublier ne se serait vu qu'en
-- salle, feuille en main.
--
-- Les formateurs ne sont pas concernés : ils viennent de `dossier_trainers` et
-- accompagnent le dossier, groupe ou non.
CREATE OR REPLACE FUNCTION app.session_expected_signers(p_session_id UUID)
RETURNS TABLE (participant_kind TEXT, participant_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, public
AS $$
  WITH seance AS (
    SELECT s.groupe_id FROM app.sessions s WHERE s.id = p_session_id
  ),
  dossiers_session AS (
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
    -- Le groupe du dossier remplace ici le seul titulaire (0175), restreint au
    -- groupe de la séance quand elle en vise un (0194).
    SELECT 'learner', a.learner_id
    FROM dossiers_session ds
    JOIN app.dossiers d ON d.id = ds.id AND d.deleted_at IS NULL
    CROSS JOIN LATERAL app.dossier_apprenants(d.id) a
    WHERE (SELECT groupe_id FROM seance) IS NULL
       OR EXISTS (
         SELECT 1 FROM app.dossier_groupe_membres m
          WHERE m.groupe_id = (SELECT groupe_id FROM seance) AND m.learner_id = a.learner_id
       )
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

-- ── 7. Les apprenants d'un groupe, pour les écrans et les documents ─────────
CREATE OR REPLACE FUNCTION app.groupe_apprenants(p_groupe_id UUID)
RETURNS TABLE(learner_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public
AS $$
  SELECT m.learner_id FROM app.dossier_groupe_membres m WHERE m.groupe_id = p_groupe_id
$$;

REVOKE ALL ON FUNCTION app.groupe_apprenants(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.groupe_apprenants(UUID) TO service_role;

COMMENT ON TABLE app.dossier_groupes IS
  'Groupes d''apprenants d''un dossier (« Groupe A », « Groupe B »). Une séance peut viser un groupe : ses participants, ses signataires attendus et ses feuilles d''émargement s''y réduisent alors.';
COMMENT ON TABLE app.dossier_groupe_membres IS
  'Appartenance d''un apprenant à un groupe. Plusieurs groupes par apprenant sont permis : les dérivations dédoublonnent.';
