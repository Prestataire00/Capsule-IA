-- Validation des acquis, objectif par objectif, sur l'attestation de fin de
-- formation (réunion avec Laurie, 16/10/2026 : « une ligne, un objectif, et
-- est-ce que c'est acquis, en cours d'acquisition ou non acquis » — une
-- appréciation globale fait tiquer les auditeurs).
-- { "<objectif>": "acquis" | "en_cours" | "non_acquis" } ; un objectif absent
-- vaut « acquis » : le formateur ne corrige que l'exception. Colonne de
-- app.dossiers : sa RLS s'applique.

ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS acquis_objectifs JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.dossiers DROP CONSTRAINT IF EXISTS dossiers_acquis_objectifs_check;
ALTER TABLE app.dossiers ADD CONSTRAINT dossiers_acquis_objectifs_check CHECK (
  jsonb_typeof(acquis_objectifs) = 'object'
  AND NOT jsonb_path_exists(acquis_objectifs, '$.* ? (@ != "acquis" && @ != "en_cours" && @ != "non_acquis")')
);

COMMENT ON COLUMN app.dossiers.acquis_objectifs IS 'Niveau atteint par objectif du programme ; absent = acquis.';
