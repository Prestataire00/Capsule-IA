-- 0188 — Le dossier accepte enfin les pièces déposées, pas seulement les PDF générés
--
-- Constat (cartographie du 21/09/2026) : l'onglet Documents d'un dossier ne
-- sait que GÉNÉRER. Aucun champ fichier. Le guidage Qualiopi affiche pourtant
-- « Ajouter la preuve » et renvoie vers cet onglet — un lien qui ne mène nulle
-- part.
--
-- Le bucket `documents` n'a jamais été prévu que pour les PDF produits par
-- l'application (0038). Or ce qu'un client transmet — attestation employeur,
-- justificatif d'un financeur, devis signé scanné — arrive en photo, en Word
-- ou en tableur. L'écran de la bibliothèque promettait d'ailleurs déjà
-- « .jpg, .png, .docx, .xlsx » : ces dépôts échouaient silencieusement au
-- niveau du stockage.
--
-- On aligne donc le bucket sur ce que la plateforme accepte déjà comme preuve
-- Qualiopi (`qualiopi-proofs`, 0140) : mêmes types, même plafond.

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'image/png',
         'image/jpeg',
         'image/webp',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/plain'
       ],
       file_size_limit = 20971520
 WHERE id = 'documents';

-- Origine de la pièce : produite par l'application, ou déposée par un humain.
-- Les deux ne se relisent pas de la même façon en audit, et seule la seconde
-- peut porter un type choisi à la main.
ALTER TABLE app.documents
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN app.documents.uploaded_by IS
  'Auteur du dépôt quand la pièce a été téléversée. NULL pour les documents générés par la plateforme.';
