-- Les échanges entre le référent d'un client et l'organisme, dans l'espace
-- entreprise (demande d'Ismael le 2026-10-07).
--
-- Le référent n'a pas de compte : il écrit depuis son lien personnel, que le
-- serveur vérifie avant d'enregistrer (service role). L'équipe lit et répond
-- depuis l'onglet Espace entreprise du dossier.

CREATE TABLE IF NOT EXISTS app.espace_entreprise_messages (
  id              UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  contact_id      UUID        NOT NULL REFERENCES app.contacts(id) ON DELETE CASCADE,
  dossier_id      UUID        REFERENCES app.dossiers(id) ON DELETE SET NULL,
  auteur          TEXT        NOT NULL CHECK (auteur IN ('entreprise', 'organisme')),
  auteur_nom      TEXT        NOT NULL,
  auteur_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  body            TEXT        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  lu_le           TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_espace_entreprise_messages_contact
  ON app.espace_entreprise_messages (contact_id, created_at);
CREATE INDEX IF NOT EXISTS ix_espace_entreprise_messages_org
  ON app.espace_entreprise_messages (organization_id, created_at DESC);

ALTER TABLE app.espace_entreprise_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.espace_entreprise_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS espace_entreprise_messages_read ON app.espace_entreprise_messages;
CREATE POLICY espace_entreprise_messages_read ON app.espace_entreprise_messages FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS espace_entreprise_messages_write ON app.espace_entreprise_messages;
CREATE POLICY espace_entreprise_messages_write ON app.espace_entreprise_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON app.espace_entreprise_messages TO authenticated;
GRANT ALL ON app.espace_entreprise_messages TO service_role;
