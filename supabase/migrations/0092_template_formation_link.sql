-- ============================================================================
-- 0092 — Héritage : un modèle de document peut cibler une formation
-- ----------------------------------------------------------------------------
-- formation_id NULL = modèle global (toutes formations). Sinon, modèle proposé
-- en priorité pour les dossiers de cette formation. RLS héritée (table existante).
-- ============================================================================

ALTER TABLE app.document_templates
  ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES app.formations(id) ON DELETE SET NULL;

COMMENT ON COLUMN app.document_templates.formation_id IS
  'Formation ciblée par ce modèle (NULL = modèle global).';

CREATE INDEX IF NOT EXISTS ix_document_templates_formation
  ON app.document_templates (formation_id) WHERE formation_id IS NOT NULL;
