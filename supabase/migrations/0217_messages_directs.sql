-- Messages directs entre personnes, hors dossier.
--
-- La messagerie d'équipe (0204) range chaque discussion sous un dossier. Pour
-- une question qui ne concerne aucun dossier — un planning, un document, un
-- échange avec un formateur — il fallait en choisir un au hasard. Demande
-- d'Ismael le 2026-10-06 : « échanger en direct avec des personnes en plus
-- des dossiers ».
--
-- Une conversation réunit deux personnes ou plus d'un même organisme. Seuls
-- ses participants la lisent : la direction ne lit pas les échanges des
-- autres. Les écritures passent par le serveur (service role), qui vérifie
-- avant que l'auteur participe à la conversation.

CREATE TABLE IF NOT EXISTS app.direct_conversations (
  id              UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_direct_conversations_org
  ON app.direct_conversations (organization_id, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS app.direct_participants (
  conversation_id UUID        NOT NULL REFERENCES app.direct_conversations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_direct_participants_user ON app.direct_participants (user_id);

CREATE TABLE IF NOT EXISTS app.direct_messages (
  id              UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  conversation_id UUID        NOT NULL REFERENCES app.direct_conversations(id) ON DELETE CASCADE,
  author_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name     TEXT        NOT NULL,
  body            TEXT        NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_direct_messages_conversation
  ON app.direct_messages (conversation_id, created_at) WHERE deleted_at IS NULL;

-- Les conversations de la personne connectée. SECURITY DEFINER : la politique
-- de lecture des participants s'appuie dessus sans se lire elle-même.
CREATE OR REPLACE FUNCTION app.my_direct_conversation_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, public AS $$
  SELECT conversation_id FROM app.direct_participants WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION app.my_direct_conversation_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.my_direct_conversation_ids() TO authenticated, service_role;

ALTER TABLE app.direct_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.direct_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.direct_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.direct_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE app.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.direct_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS direct_conversations_read ON app.direct_conversations;
CREATE POLICY direct_conversations_read ON app.direct_conversations FOR SELECT TO authenticated
  USING (id IN (SELECT app.my_direct_conversation_ids()));
DROP POLICY IF EXISTS direct_conversations_write ON app.direct_conversations;
CREATE POLICY direct_conversations_write ON app.direct_conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS direct_participants_read ON app.direct_participants;
CREATE POLICY direct_participants_read ON app.direct_participants FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT app.my_direct_conversation_ids()));
DROP POLICY IF EXISTS direct_participants_write ON app.direct_participants;
CREATE POLICY direct_participants_write ON app.direct_participants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS direct_messages_read ON app.direct_messages;
CREATE POLICY direct_messages_read ON app.direct_messages FOR SELECT TO authenticated
  USING (conversation_id IN (SELECT app.my_direct_conversation_ids()));
DROP POLICY IF EXISTS direct_messages_write ON app.direct_messages;
CREATE POLICY direct_messages_write ON app.direct_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON app.direct_conversations, app.direct_participants, app.direct_messages TO authenticated;
GRANT ALL ON app.direct_conversations, app.direct_participants, app.direct_messages TO service_role;
