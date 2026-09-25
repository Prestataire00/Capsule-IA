-- Le questionnaire d'une entreprise cliente a désormais un destinataire nommé.
--
-- `recipient_kind` acceptait déjà « company_rep », mais aucune colonne ne disait
-- QUI répondait : ni contact, ni entreprise. Une réponse serait arrivée sans
-- qu'on puisse la rattacher à personne — or c'est précisément ce qu'un audit
-- Qualiopi demande d'une preuve : de qui elle vient.
--
-- Demande d'Ismael le 2026-09-25 : interroger l'entreprise en plus de
-- l'apprenant et du financeur. Elle paie, elle décide de recommencer, et son
-- retour ne se lit dans aucun des trois autres questionnaires.
--
-- Le destinataire est un CONTACT, pas l'entreprise : c'est une personne qui
-- répond, et c'est elle qui porte l'adresse.

ALTER TABLE app.questionnaire_assignments
  ADD COLUMN IF NOT EXISTS recipient_contact_id UUID REFERENCES app.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_questionnaire_assignments_contact
  ON app.questionnaire_assignments (recipient_contact_id)
  WHERE recipient_contact_id IS NOT NULL;

COMMENT ON COLUMN app.questionnaire_assignments.recipient_contact_id IS
  'Interlocuteur chez le client qui répond, pour recipient_kind = ''company_rep''. Le contact supprimé laisse la réponse en place (ON DELETE SET NULL) : une preuve d''audit ne disparaît pas avec une fiche.';
