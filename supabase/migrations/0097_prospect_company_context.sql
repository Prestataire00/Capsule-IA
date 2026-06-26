-- ============================================================================
-- 0097 — Contexte entreprise sur les prospects (inscription groupée)
-- ============================================================================
-- Parcours d'inscription « entreprise » : une entreprise inscrit plusieurs
-- salariés (1 prospect par salarié, cf. submitCompanyEnrollment). On ajoute :
--   - le SIREN (auto-rempli via l'API recherche-entreprises.api.gouv.fr) ;
--   - 3 questions de contexte posées avant la saisie des salariés :
--     effectif N-1, nombre de salariés à former, budget formation déjà entamé ;
--   - company_batch_id : regroupe les prospects créés en une même inscription.
-- Toutes nullables → aucun impact sur le parcours individuel (valeurs NULL).
-- ============================================================================

ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS company_siren        TEXT
    CHECK (company_siren IS NULL OR company_siren ~ '^[0-9]{9}$'),
  ADD COLUMN IF NOT EXISTS company_headcount_n1 INTEGER
    CHECK (company_headcount_n1 IS NULL OR company_headcount_n1 >= 0),
  ADD COLUMN IF NOT EXISTS employees_to_train   INTEGER
    CHECK (employees_to_train IS NULL OR employees_to_train >= 0),
  ADD COLUMN IF NOT EXISTS training_budget_used BOOLEAN,
  ADD COLUMN IF NOT EXISTS company_batch_id     UUID;

CREATE INDEX IF NOT EXISTS prospects_company_batch_id_idx
  ON app.prospects (company_batch_id)
  WHERE company_batch_id IS NOT NULL;

COMMENT ON COLUMN app.prospects.company_batch_id IS
  'Regroupe les prospects créés en une seule inscription entreprise (un par salarié). NULL pour le parcours individuel.';
