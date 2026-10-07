-- Les échanges de l'espace entreprise : un fil général avec toute l'équipe,
-- et un fil direct avec une personne (demande d'Ismael le 2026-10-07 :
-- « l'entreprise écrit soit un message général, soit direct à Faouzi, Laurie
-- ou Isma »).
--
-- `interlocuteur_user_id` désigne le membre de l'équipe du fil direct ; NULL
-- = le fil général. Un fil direct n'est lu que par son interlocuteur : la
-- direction ne lit pas ce qu'un client a écrit à une autre personne.

ALTER TABLE app.espace_entreprise_messages
  ADD COLUMN IF NOT EXISTS interlocuteur_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_espace_entreprise_messages_fil
  ON app.espace_entreprise_messages (contact_id, interlocuteur_user_id, created_at);

DROP POLICY IF EXISTS espace_entreprise_messages_read ON app.espace_entreprise_messages;
CREATE POLICY espace_entreprise_messages_read ON app.espace_entreprise_messages FOR SELECT TO authenticated
  USING (
    organization_id = app.current_organization_id()
    AND app.is_staff()
    AND (interlocuteur_user_id IS NULL OR interlocuteur_user_id = auth.uid())
  );
