-- Réussite ou échec de chaque apprenant d'un dossier, coché dans l'onglet
-- Participants de la séance (demande du 17/10/2026, sur le modèle d'un autre
-- CRM : « on coche sur l'apprenant, c'est réussi ou c'est en échec »).
-- { "<learner_id>": "reussite" | "echec" } ; absent = pas encore statué.
-- Colonne de app.dossiers : sa RLS s'applique.

ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS resultats JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.dossiers DROP CONSTRAINT IF EXISTS dossiers_resultats_check;
ALTER TABLE app.dossiers ADD CONSTRAINT dossiers_resultats_check CHECK (
  jsonb_typeof(resultats) = 'object'
  AND NOT jsonb_path_exists(resultats, '$.* ? (@ != "reussite" && @ != "echec")')
);

COMMENT ON COLUMN app.dossiers.resultats IS 'Résultat de la formation par apprenant : reussite | echec.';
