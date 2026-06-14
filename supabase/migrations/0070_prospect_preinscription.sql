-- ============================================================================
-- 0070 — Pré-inscription : financeurs FAF-CA/AGEFIPH, multi-financement,
--        champs entreprise + référent
-- ============================================================================
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS : idempotent (déjà posé en 0043),
-- gardé ici pour rendre la migration autonome. La nouvelle valeur n'est PAS
-- utilisée dans cette même migration (le backfill ne lit que funder_kind
-- existant) → autorisé en transaction, migration unique sûre.
-- funder_kinds capture le multi-financement souhaité ; funder_kind reste le
-- financement primaire (1er du tableau).
-- ============================================================================

ALTER TYPE app.funder_kind ADD VALUE IF NOT EXISTS 'faf_ca';
ALTER TYPE app.funder_kind ADD VALUE IF NOT EXISTS 'agefiph';

ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS company_siret   TEXT,
  ADD COLUMN IF NOT EXISTS company_address JSONB,
  ADD COLUMN IF NOT EXISTS referent_name   TEXT,
  ADD COLUMN IF NOT EXISTS referent_email  CITEXT,
  ADD COLUMN IF NOT EXISTS referent_phone  TEXT,
  ADD COLUMN IF NOT EXISTS funder_kinds    app.funder_kind[] NOT NULL DEFAULT '{}';

UPDATE app.prospects SET funder_kinds = ARRAY[funder_kind] WHERE cardinality(funder_kinds) = 0;

COMMENT ON COLUMN app.prospects.funder_kinds IS 'Financements souhaités (multi). prospects.funder_kind = primaire (1er).';
