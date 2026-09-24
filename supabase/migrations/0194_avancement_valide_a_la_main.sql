-- Valider une étape d'avancement à la main.
--
-- L'avancement d'un dossier est déduit des données réelles : questionnaires,
-- sessions, documents, signatures, factures. C'était un parti pris — rien à
-- cocher, donc rien qui puisse mentir sur l'état d'un dossier.
--
-- Il ne tient pas jusqu'au bout. Une convention se signe parfois sur papier, un
-- règlement arrive par chèque, l'analyse du besoin se fait au téléphone. Le
-- dossier reste alors bloqué sur une étape pourtant franchie, et l'écran
-- réclame une action déjà faite.
--
-- Le compromis : la validation manuelle existe, mais elle ne se déguise pas en
-- fait constaté. On garde QUI a validé et QUAND, l'écran le dit, et la
-- déduction continue de tourner — si la preuve arrive ensuite, elle reprend la
-- main. Une étape validée à la main puis démentie par les données se voit.

CREATE TABLE IF NOT EXISTS app.dossier_progress_overrides (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id       UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  -- Clé de l'étape dans `loadDossierProgress` : needs, session, devis,
  -- devis_sent, devis_signed, convention, convention_signed, done, paid.
  step_key         TEXT        NOT NULL CHECK (step_key ~ '^[a-z_]+$'),
  -- Pourquoi on l'a validée sans preuve dans l'application. C'est ce qu'on
  -- relira devant un auditeur.
  note             TEXT        CHECK (note IS NULL OR length(note) <= 500),
  validated_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dossier_progress_overrides_unique UNIQUE (dossier_id, step_key)
);

CREATE INDEX IF NOT EXISTS ix_dossier_progress_overrides_dossier
  ON app.dossier_progress_overrides (dossier_id);

ALTER TABLE app.dossier_progress_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_progress_overrides FORCE ROW LEVEL SECURITY;

-- Lecture : les membres de l'organisation, pour afficher l'avancement.
DROP POLICY IF EXISTS dossier_progress_overrides_select ON app.dossier_progress_overrides;
CREATE POLICY dossier_progress_overrides_select ON app.dossier_progress_overrides
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- Écriture : service role. La Server Action vérifie le rôle et l'organisation
-- avant d'écrire — valider une étape engage ce que l'organisme déclare.
DROP POLICY IF EXISTS dossier_progress_overrides_write ON app.dossier_progress_overrides;
CREATE POLICY dossier_progress_overrides_write ON app.dossier_progress_overrides
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.dossier_progress_overrides IS
  'Étapes d''avancement validées à la main, faute de preuve dans l''application. Ne remplacent pas la déduction : elles s''y ajoutent, en gardant qui et quand.';
COMMENT ON COLUMN app.dossier_progress_overrides.note IS
  'Motif de la validation manuelle — ce qu''on relira devant un auditeur.';
