-- Des groupes pour les séances sans dossier.
--
-- Les groupes (0195) étaient portés par le dossier. Une séance planifiée pour
-- un client sans dossier — ses dix-sept stagiaires inscrits directement — ne
-- pouvait donc pas être répartie : le bouton « Répartir en groupes » n'y
-- apparaissait pas, et il semblait avoir disparu. Demande d'Ismael le
-- 2026-10-05 : créer des groupes toujours, puis y rattacher des séances.
--
-- Un groupe appartient désormais à un dossier OU à l'entreprise cliente des
-- séances libres, jamais aux deux. Le reste (membres, séance qui vise un
-- groupe, dérivations) ne change pas.

ALTER TABLE app.dossier_groupes
  ALTER COLUMN dossier_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES app.companies(id) ON DELETE CASCADE;

ALTER TABLE app.dossier_groupes DROP CONSTRAINT IF EXISTS dossier_groupes_porteur;
ALTER TABLE app.dossier_groupes
  ADD CONSTRAINT dossier_groupes_porteur CHECK ((dossier_id IS NULL) <> (company_id IS NULL));

-- Deux « Groupe A » chez le même client ne se distingueraient pas à l'œil.
CREATE UNIQUE INDEX IF NOT EXISTS ux_dossier_groupes_client_nom
  ON app.dossier_groupes (company_id, nom) WHERE company_id IS NOT NULL;

-- Le formateur voit le groupe de ses séances, même sans dossier.
DROP POLICY IF EXISTS dossier_groupes_select ON app.dossier_groupes;
CREATE POLICY dossier_groupes_select ON app.dossier_groupes FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    OR dossier_id IN (SELECT app.my_trainer_dossier_ids())
    OR id IN (SELECT s.groupe_id FROM app.sessions s WHERE s.id IN (SELECT app.my_trainer_session_ids()))
  );

DROP POLICY IF EXISTS dossier_groupe_membres_select ON app.dossier_groupe_membres;
CREATE POLICY dossier_groupe_membres_select ON app.dossier_groupe_membres FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    OR groupe_id IN (
      SELECT g.id FROM app.dossier_groupes g
      WHERE g.dossier_id IN (SELECT app.my_trainer_dossier_ids())
    )
    OR groupe_id IN (SELECT s.groupe_id FROM app.sessions s WHERE s.id IN (SELECT app.my_trainer_session_ids()))
  );

COMMENT ON COLUMN app.dossier_groupes.company_id IS
  'Entreprise cliente qui porte le groupe quand ses séances n''ont pas de dossier (0212). Exclusif de dossier_id.';
