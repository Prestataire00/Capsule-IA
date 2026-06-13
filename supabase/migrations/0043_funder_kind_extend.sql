-- ============================================================================
-- 0043 — Ajoute FAF-CA et AGEFIPH aux types de financeur
-- ============================================================================
-- ALTER TYPE ... ADD VALUE : autorisé en transaction (PG12+) tant qu'on n'utilise
-- pas la nouvelle valeur dans la même transaction (ce n'est pas le cas ici).

ALTER TYPE app.funder_kind ADD VALUE IF NOT EXISTS 'faf_ca';
ALTER TYPE app.funder_kind ADD VALUE IF NOT EXISTS 'agefiph';
