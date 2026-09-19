-- Un dossier peut porter plusieurs apprenants.
--
-- Jusqu'ici il n'en portait qu'un : `dossiers.learner_id`. Les autres
-- n'existaient qu'à travers `session_participants` — donc uniquement si une
-- séance était déjà planifiée. Conséquence observée : sur un dossier tout juste
-- créé, sans séance, ajouter un stagiaire le créait bien dans le CRM mais ne
-- le rattachait à rien, et il disparaissait de l'écran. Le geste semblait
-- échouer alors qu'il écrivait à moitié.
--
-- C'est aussi ce qu'il faut pour une commande d'entreprise : une société
-- inscrit dix salariés sur un même dossier, avant même qu'une date soit posée.
--
-- `dossiers.learner_id` reste (il porte le titulaire, et beaucoup de code s'y
-- appuie) : cette table est additive.

CREATE TABLE IF NOT EXISTS app.dossier_learners (
  dossier_id       UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  learner_id       UUID        NOT NULL REFERENCES app.learners(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by         UUID        REFERENCES auth.users(id),
  PRIMARY KEY (dossier_id, learner_id)
);

CREATE INDEX IF NOT EXISTS ix_dossier_learners_learner
  ON app.dossier_learners (learner_id);
CREATE INDEX IF NOT EXISTS ix_dossier_learners_org
  ON app.dossier_learners (organization_id);

ALTER TABLE app.dossier_learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_learners FORCE ROW LEVEL SECURITY;

-- Lecture : l'organisation, et le formateur à qui le dossier est confié (0171).
DROP POLICY IF EXISTS dossier_learners_select ON app.dossier_learners;
CREATE POLICY dossier_learners_select ON app.dossier_learners FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    OR dossier_id IN (SELECT app.my_trainer_dossier_ids())
  );

-- Écriture : service role (les Server Actions gardent le rôle et l'organisation).
DROP POLICY IF EXISTS dossier_learners_write ON app.dossier_learners;
CREATE POLICY dossier_learners_write ON app.dossier_learners FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Reprise de l'existant : le titulaire de chaque dossier rejoint son groupe,
-- sauf le titulaire provisoire posé à l'import, qui ne désigne personne.
INSERT INTO app.dossier_learners (dossier_id, learner_id, organization_id)
SELECT d.id, d.learner_id, d.organization_id
  FROM app.dossiers d
  JOIN app.learners l ON l.id = d.learner_id
 WHERE d.learner_id IS NOT NULL
   AND d.deleted_at IS NULL
   AND COALESCE(l.email, '') NOT LIKE '%@import.invalid'
ON CONFLICT DO NOTHING;

-- Et les participants déjà inscrits aux séances du dossier : ils en font partie.
INSERT INTO app.dossier_learners (dossier_id, learner_id, organization_id)
SELECT DISTINCT d.id, sp.learner_id, d.organization_id
  FROM app.dossiers d
  JOIN app.sessions s
    ON s.dossier_id = d.id
    OR s.id IN (SELECT sd.session_id FROM app.session_dossiers sd WHERE sd.dossier_id = d.id)
  JOIN app.session_participants sp
    ON sp.session_id = s.id AND sp.participant_kind = 'learner' AND sp.learner_id IS NOT NULL
 WHERE d.deleted_at IS NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE app.dossier_learners IS
  'Stagiaires d''un dossier, indépendamment des séances : une commande d''entreprise en compte plusieurs avant toute date.';
