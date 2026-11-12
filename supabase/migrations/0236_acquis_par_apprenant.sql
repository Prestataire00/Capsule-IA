-- Les acquis par objectif, apprenant par apprenant (demande du 12/11/2026) :
-- un dossier de groupe réunit dix-sept stagiaires, chacun a sa propre
-- évaluation. { "<learner_id>": { "<objectif>": "acquis" | "en_cours" |
-- "non_acquis" } }. Ce qui n'y figure pas reprend le réglage du dossier
-- (acquis_objectifs, 0234), puis « acquis ». Colonne de app.dossiers : sa RLS s'applique.

ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS acquis_par_apprenant JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.dossiers DROP CONSTRAINT IF EXISTS dossiers_acquis_par_apprenant_check;
ALTER TABLE app.dossiers ADD CONSTRAINT dossiers_acquis_par_apprenant_check CHECK (
  jsonb_typeof(acquis_par_apprenant) = 'object'
  AND NOT jsonb_path_exists(acquis_par_apprenant, '$.* ? (@.type() != "object")')
  AND NOT jsonb_path_exists(acquis_par_apprenant, '$.*.* ? (@ != "acquis" && @ != "en_cours" && @ != "non_acquis")')
);

COMMENT ON COLUMN app.dossiers.acquis_par_apprenant IS 'Acquis par objectif, par apprenant ; à défaut acquis_objectifs, puis acquis.';
