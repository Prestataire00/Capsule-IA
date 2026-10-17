-- Le livret d'accueil de l'organisme, déposé une fois dans Paramètres et mis
-- à disposition dans chaque espace entreprise, pour que le client le
-- transmette à ses salariés (réunion avec Laurie, 16/10/2026).
-- Rangé dans le bucket privé org_assets (policies 0058 : lecture membres,
-- écriture owner/admin) ; l'espace entreprise le sert après vérification du lien.

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS livret_accueil_path TEXT
    CHECK (livret_accueil_path IS NULL OR livret_accueil_path ~ '^[0-9a-f-]{36}/livret-accueil\.pdf$');

COMMENT ON COLUMN app.organizations.livret_accueil_path IS 'Livret d''accueil (PDF, org_assets), visible dans les espaces entreprise.';

-- Un livret illustré dépasse vite les 5 Mo d'un RIB.
UPDATE storage.buckets SET file_size_limit = 20971520 WHERE id = 'org_assets';
