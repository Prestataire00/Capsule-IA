-- Espace formateur — relation client.
--
-- Le formateur voyait ses séances mais restait coupé du client : aucun contact,
-- aucun endroit où déposer son support de cours, aucun moyen d'écrire aux
-- participants. Trois manques, trois objets.
--
-- Les supports sont attachés à la séance (et non à un module du catalogue,
-- `app.module_resources`) : une formation montée pour un client n'a pas toujours
-- de module, et le formateur travaille séance par séance.

-- ── 1. Supports de cours de la séance ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.session_resources (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id       UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description      TEXT        CHECK (description IS NULL OR length(description) <= 2000),
  -- 'fichier' : déposé dans le bucket `documents`. 'lien' : ressource externe
  -- (vidéo, quiz, espace partagé) — un formateur héberge souvent ailleurs.
  kind             TEXT        NOT NULL DEFAULT 'fichier' CHECK (kind IN ('fichier', 'lien')),
  storage_path     TEXT,
  external_url     TEXT,
  mime_type        TEXT,
  file_size_bytes  BIGINT      CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  position         INT         NOT NULL DEFAULT 0 CHECK (position >= 0),
  -- Non publié = brouillon du formateur, invisible dans l'espace apprenant.
  is_published     BOOLEAN     NOT NULL DEFAULT true,
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ NULL,
  CONSTRAINT session_resources_source CHECK (
    (kind = 'fichier' AND storage_path IS NOT NULL)
    OR (kind = 'lien' AND external_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_session_resources_session
  ON app.session_resources (session_id, position) WHERE deleted_at IS NULL;

ALTER TABLE app.session_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_resources FORCE ROW LEVEL SECURITY;

-- Lecture : l'organisme, et le formateur pour SES séances (0150).
DROP POLICY IF EXISTS session_resources_select ON app.session_resources;
CREATE POLICY session_resources_select ON app.session_resources FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      organization_id = app.current_organization_id()
      OR session_id IN (SELECT app.my_trainer_session_ids())
    )
  );

-- Écriture : service role (les Server Actions gardent le compte et la séance).
DROP POLICY IF EXISTS session_resources_write ON app.session_resources;
CREATE POLICY session_resources_write ON app.session_resources FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.session_resources IS
  'Supports de cours d''une séance (fichiers ou liens), déposés par le formateur ou l''organisme.';

-- ── 2. Messagerie de la séance ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.session_messages (
  id                 UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id    UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id         UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  author_kind        TEXT        NOT NULL CHECK (author_kind IN ('formateur', 'organisme', 'apprenant')),
  -- L'apprenant écrit depuis son espace à jeton : il n'a pas de compte, d'où
  -- l'auteur résolu par sa fiche plutôt que par `auth.users`.
  author_user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_learner_id  UUID        REFERENCES app.learners(id) ON DELETE SET NULL,
  author_name        TEXT        NOT NULL CHECK (length(btrim(author_name)) > 0),
  body               TEXT        NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_session_messages_session
  ON app.session_messages (session_id, created_at) WHERE deleted_at IS NULL;

ALTER TABLE app.session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_messages_select ON app.session_messages;
CREATE POLICY session_messages_select ON app.session_messages FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      organization_id = app.current_organization_id()
      OR session_id IN (SELECT app.my_trainer_session_ids())
    )
  );

DROP POLICY IF EXISTS session_messages_write ON app.session_messages;
CREATE POLICY session_messages_write ON app.session_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.session_messages IS
  'Fil de discussion d''une séance entre le formateur, l''organisme et les apprenants.';

-- ── 3. Marque de lecture (badge « non lus ») ────────────────────────────────

CREATE TABLE IF NOT EXISTS app.session_message_reads (
  session_id    UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

ALTER TABLE app.session_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_message_reads FORCE ROW LEVEL SECURITY;

-- Chacun ne voit que sa propre marque de lecture.
DROP POLICY IF EXISTS session_message_reads_select ON app.session_message_reads;
CREATE POLICY session_message_reads_select ON app.session_message_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS session_message_reads_write ON app.session_message_reads;
CREATE POLICY session_message_reads_write ON app.session_message_reads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.session_message_reads IS
  'Dernière lecture du fil d''une séance, par utilisateur (badge des messages non lus).';
