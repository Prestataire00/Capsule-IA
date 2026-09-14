-- Référent d'un dossier : la personne du client à qui sont adressées la
-- convention, les devis et les factures. Elle était jusqu'ici implicite, prise
-- sur la fiche entreprise (`companies.contact_name`) — donc la même pour toutes
-- les affaires d'un client, alors qu'un intra a souvent son interlocuteur.
--
-- Pointe la table `contacts`, déjà remplie par l'import d'une convention
-- (signataire) et par la saisie manuelle d'une entreprise.

ALTER TABLE app.dossiers
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES app.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_dossiers_contact
  ON app.dossiers (contact_id) WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN app.dossiers.contact_id IS
  'Référent du dossier chez le client : destinataire des conventions, devis et factures (NULL = on retombe sur le contact de l''entreprise).';
