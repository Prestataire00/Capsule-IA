-- ============================================================================
-- 0158 — GED : une entrée par document, dernière version en tête
--
-- Jusqu'ici, chaque génération créait une ligne de plus dès que le contenu
-- changeait d'un octet : une facture rééditée trois fois apparaissait trois
-- fois dans la bibliothèque. On identifie désormais un document par sa
-- SOURCE (`source_key`, ex. « invoice:<id> ») : la dernière version est la
-- seule affichée (`is_current`), les précédentes sont conservées en
-- historique (`parent_document_id` + `version`, statut « archivé »).
--
-- `source_url` rend le document « vivant » (principe repris de RFC) : à
-- l'ouverture, la pièce est régénérée depuis les données à jour — une feuille
-- d'émargement téléchargée après de nouvelles signatures ne peut plus être
-- incomplète. Les pièces figées (devis signé, facture émise) n'en ont pas.
-- ============================================================================

ALTER TABLE app.documents
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN app.documents.source_key IS
  'Identifiant stable de la source (« invoice:<id> », « convention:<dossier>:<payer> », « emargement:<sheet> »). Une seule version courante par clé.';
COMMENT ON COLUMN app.documents.source_url IS
  'Route de régénération (document « vivant ») ; NULL = pièce figée servie telle quelle.';
COMMENT ON COLUMN app.documents.is_current IS
  'Dernière version du document. Les versions précédentes restent consultables en historique.';

-- Une seule version courante par source et par organisme.
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_source_current
  ON app.documents(organization_id, source_key)
  WHERE source_key IS NOT NULL AND is_current AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_documents_parent
  ON app.documents(parent_document_id)
  WHERE parent_document_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
