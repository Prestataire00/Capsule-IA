-- ============================================================================
-- 0089 — Modèles de documents éditables (HTML inline) + rendu inline des documents
-- ----------------------------------------------------------------------------
-- Le schéma 0009 prévoyait les templates en fichier (storage_path + versions).
-- On ajoute un contenu HTML éditable directement en base (façon sosafe :
-- modèle HTML avec variables {slug}), et un rendu HTML inline sur les documents
-- générés à partir d'un modèle (consultables/imprimables sans fichier PDF).
-- RLS : héritée des tables existantes (pas de nouvelle policy nécessaire).
-- ============================================================================

ALTER TABLE app.document_templates
  ADD COLUMN IF NOT EXISTS content_html TEXT;

COMMENT ON COLUMN app.document_templates.content_html IS
  'Corps HTML éditable du modèle, avec variables {slug} injectées au rendu.';

ALTER TABLE app.documents
  ADD COLUMN IF NOT EXISTS content_html TEXT;

COMMENT ON COLUMN app.documents.content_html IS
  'HTML rendu (modèle + variables) pour un document généré depuis un modèle ; '
  'NULL pour les documents de type fichier (PDF en storage_path).';
