-- ============================================================================
-- 0055 — Multi-modalité sur le dossier (additif)
-- ============================================================================
-- modality (scalaire) reste la modalité PRIMAIRE. modalities[] porte l'ensemble.
-- Invariant : la primaire appartient à l'ensemble.
-- ============================================================================

ALTER TABLE app.dossiers
  ADD COLUMN modalities app.training_modality[] NOT NULL DEFAULT '{}';

-- Backfill : refléter le scalaire existant
UPDATE app.dossiers SET modalities = ARRAY[modality] WHERE cardinality(modalities) = 0;

ALTER TABLE app.dossiers
  ADD CONSTRAINT ck_dossiers_modality_in_set
  CHECK (cardinality(modalities) = 0 OR modality = ANY(modalities));

COMMENT ON COLUMN app.dossiers.modalities IS
  'Ensemble des modalités du dossier ; app.dossiers.modality = modalité primaire (1ʳᵉ choisie).';
