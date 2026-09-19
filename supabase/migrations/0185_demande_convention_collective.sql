-- 0185 — La convention collective est demandée dès la demande d'inscription
--
-- `app.companies` porte déjà `convention_collective` (saisie dans la fiche
-- entreprise du CRM), mais la demande ne la captait pas : l'information était
-- réclamée au client plus tard, par e-mail ou par téléphone, alors que c'est
-- l'employeur qui la connaît et qu'il remplit déjà le formulaire.
--
-- Elle sert concrètement à instruire le financement : la branche détermine
-- l'OPCO de rattachement et le barème applicable. La recueillir à la demande
-- évite un aller-retour sur chaque dossier salarié.
--
-- Texte libre et non obligatoire : un employeur la désigne tantôt par son
-- IDCC (« 1486 »), tantôt par son intitulé (« Bureaux d'études techniques »).
-- Exiger un format normalisé ferait échouer des demandes légitimes ; la
-- normalisation, si elle vient un jour, se fera côté fiche entreprise.

ALTER TABLE app.prospects
  ADD COLUMN IF NOT EXISTS convention_collective TEXT
    CHECK (convention_collective IS NULL OR length(convention_collective) <= 200);

COMMENT ON COLUMN app.prospects.convention_collective IS
  'Convention collective de l''employeur, telle qu''il la désigne (IDCC ou intitulé). Reportée sur app.companies.convention_collective à la conversion.';
