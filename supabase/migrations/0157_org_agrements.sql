-- ============================================================================
-- 0157 — Agréments de l'organisme (CNAPS, habilitations…)
--
-- Les documents portent tous le même pied d'identité : raison sociale,
-- adresse, téléphone, e-mail, SIRET et déclaration d'activité. Il manquait les
-- agréments propres au métier (CNAPS pour la sécurité privée, habilitations
-- SST, etc.), qui doivent figurer sur les documents remis aux clients et aux
-- financeurs.
-- ============================================================================

ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS certifications TEXT;

COMMENT ON COLUMN app.organizations.certifications IS
  'Agréments et habilitations affichés sur les documents (ex. « CNAPS : FOR-004-…​ »). Texte libre, une ou plusieurs mentions séparées par « · ».';

NOTIFY pgrst, 'reload schema';
