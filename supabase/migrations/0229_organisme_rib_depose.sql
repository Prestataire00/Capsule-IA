-- Le RIB de l'organisme, déposé tel quel (PDF ou image) dans Paramètres et
-- joint en dernière page de chaque facture (demande d'Ismael, 15/10/2026).
-- Rangé dans le bucket privé org_assets, sous le dossier de l'organisme : les
-- policies de 0058 (lecture membres, écriture owner/admin) s'appliquent.

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS rib_path TEXT CHECK (rib_path IS NULL OR rib_path ~ '^[0-9a-f-]{36}/rib\.(pdf|png|jpg)$');

COMMENT ON COLUMN app.organizations.rib_path IS 'RIB déposé (org_assets), joint aux factures.';

-- Le bucket n'acceptait que des PNG de 2 Mo (signature, cachet, logo).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'application/pdf'],
    file_size_limit = 5242880
WHERE id = 'org_assets';
