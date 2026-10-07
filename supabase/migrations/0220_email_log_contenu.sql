-- Le contenu des e-mails envoyés, pour les relire (demande d'Ismael le
-- 2026-10-07 : dans l'espace entreprise, les échanges « doivent être
-- ouvrables »). Le journal ne gardait que l'objet et le destinataire.
-- Lecture : la politique existante (membres de l'organisme) ; le référent
-- d'un client y accède par le serveur, après vérification de son lien.

ALTER TABLE app.email_log ADD COLUMN IF NOT EXISTS body_html TEXT;
