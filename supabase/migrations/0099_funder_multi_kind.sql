-- 0099_funder_multi_kind.sql
-- Un financeur peut désormais porter PLUSIEURS types (ex. OPCO + Entreprise).
-- On ajoute un tableau `kinds` ; `kind` reste le type principal (rétro-compat,
-- = premier élément) pour tout le code qui lit déjà `funders.kind`.

ALTER TABLE app.funders
  ADD COLUMN IF NOT EXISTS kinds app.funder_kind[] NOT NULL DEFAULT '{}';

-- Backfill : les financeurs existants prennent leur type unique comme tableau.
UPDATE app.funders
  SET kinds = ARRAY[kind]
  WHERE cardinality(kinds) = 0;
