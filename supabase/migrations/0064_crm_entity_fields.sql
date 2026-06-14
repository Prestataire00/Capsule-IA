-- ============================================================================
-- 0064 — Champs CRM manquants (F-CRM-01/02/03/05/11), additifs
-- ============================================================================

-- F-CRM-01 : entreprise — contact référent nommé, convention collective, OPCO.
ALTER TABLE app.companies
  ADD COLUMN contact_name         TEXT,
  ADD COLUMN convention_collective TEXT,
  ADD COLUMN opco                 TEXT;

-- F-CRM-02 : apprenant — statut (salarié / dirigeant / indépendant).
ALTER TABLE app.learners
  ADD COLUMN statut TEXT CHECK (statut IS NULL OR statut IN ('salarie', 'dirigeant', 'independant'));

-- F-CRM-03 : formation — prix par module.
ALTER TABLE app.modules
  ADD COLUMN price_cents BIGINT CHECK (price_cents IS NULL OR price_cents >= 0);

-- F-CRM-05 : formateur — NDA, contrat, lien Zoom personnel.
ALTER TABLE app.trainers
  ADD COLUMN nda           TEXT,
  ADD COLUMN contract_path TEXT,
  ADD COLUMN zoom_url      TEXT;

-- F-CRM-11 : tags personnalisés sur dossier (entreprises/apprenants en ont déjà).
ALTER TABLE app.dossiers
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX ix_dossiers_tags ON app.dossiers USING GIN (tags) WHERE deleted_at IS NULL;
