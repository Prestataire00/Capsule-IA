-- 0183 — L'empreinte de preuve d'une signature de document est enfin conservée
--
-- Constat (audit du 19/09/2026) : l'action de signature depuis l'espace
-- apprenant calculait une empreinte SHA-256 de l'image signée, de l'adresse IP,
-- du navigateur et de l'horodatage… puis la jetait. La variable n'était lue
-- nulle part — c'est le lint qui l'a révélé — parce que
-- `app.document_signatures` n'a jamais eu de colonne pour la recevoir.
--
-- Cette empreinte est ce qui rend une signature vérifiable après coup : elle
-- lie l'image au contexte de signature, et toute retouche ultérieure de l'un
-- des éléments la fait diverger. `app.attendance_signatures` la conserve depuis
-- la 0008 (`signature_hash`) ; les signatures de documents — conventions,
-- attestations — en étaient privées.
--
-- Colonne nullable : les signatures déjà recueillies n'en ont pas, et une
-- valeur inventée après coup ne prouverait rien.

ALTER TABLE app.document_signatures
  ADD COLUMN IF NOT EXISTS signature_hash TEXT;

COMMENT ON COLUMN app.document_signatures.signature_hash IS
  'SHA-256 de l''image signée liée au contexte (IP, navigateur, horodatage). Preuve d''intégrité : toute retouche de l''un des éléments la fait diverger. NULL pour les signatures antérieures au 19/09/2026.';
