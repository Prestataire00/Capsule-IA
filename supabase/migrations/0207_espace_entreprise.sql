-- ============================================================================
-- 0207 — Espace entreprise du référent de dossier
-- ============================================================================
-- Le référent du client (dossiers.contact_id, 0167) reçoit un lien personnel
-- vers un espace où il retrouve les documents de ses dossiers que l'organisme
-- a rendus visibles. Chaque document est interne par défaut : rien ne sort
-- sans qu'on l'ait choisi au dépôt, ou ensuite dans la liste.
-- Le lien est signé (pas de table de jetons) ; le couper pose une date sur le
-- contact, et tout lien émis avant cette date est refusé.
-- ============================================================================

ALTER TABLE app.documents
  ADD COLUMN IF NOT EXISTS visible_entreprise BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app.documents.visible_entreprise IS
  'Visible dans l''espace entreprise du référent du dossier (0207). Interne par défaut.';

CREATE INDEX IF NOT EXISTS ix_documents_visible_entreprise
  ON app.documents (dossier_id) WHERE visible_entreprise AND deleted_at IS NULL;

ALTER TABLE app.contacts
  ADD COLUMN IF NOT EXISTS espace_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN app.contacts.espace_revoked_at IS
  'Liens de l''espace entreprise émis avant cette date refusés (0207).';
