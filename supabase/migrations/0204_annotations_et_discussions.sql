-- ============================================================================
-- 0204 — Annotations des contenus pédagogiques, discussion d'équipe par dossier
-- ============================================================================
-- 1. Annotations : le validateur marque en couleur ce qui ne va pas dans un
--    support ou un exercice déposé par le formateur — tout le contenu, une
--    question, ou un extrait cité. Le formateur les lit et les marque corrigées.
-- 2. Discussion d'équipe par dossier : formateurs du dossier, validateurs et
--    copie (0203). Chaque message mentionne au moins une personne, qui en est
--    prévenue. Distincte du fil de séance (0164), ouvert aux stagiaires.
-- Lecture : l'équipe de l'organisme, et le formateur pour ses dossiers.
-- Écriture : par le serveur seul, après contrôle de l'auteur.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.content_annotations (
  id              UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  target_kind     TEXT        NOT NULL CHECK (target_kind IN ('support', 'cours')),
  target_id       UUID        NOT NULL,
  question_id     TEXT,
  extrait         TEXT        CHECK (extrait IS NULL OR char_length(extrait) BETWEEN 1 AND 500),
  couleur         TEXT        NOT NULL CHECK (couleur IN ('a_revoir', 'a_preciser', 'suggestion', 'bien')),
  commentaire     TEXT        NOT NULL CHECK (char_length(commentaire) BETWEEN 1 AND 2000),
  author_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name     TEXT        NOT NULL,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_content_annotations_target
  ON app.content_annotations (target_kind, target_id, created_at) WHERE deleted_at IS NULL;

ALTER TABLE app.content_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.content_annotations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_annotations_read ON app.content_annotations;
CREATE POLICY content_annotations_read ON app.content_annotations FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS content_annotations_write ON app.content_annotations;
CREATE POLICY content_annotations_write ON app.content_annotations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app.dossier_team_messages (
  id              UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id      UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  author_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name     TEXT        NOT NULL,
  body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  mentions        UUID[]      NOT NULL DEFAULT '{}' CHECK (cardinality(mentions) >= 1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_dossier_team_messages_dossier
  ON app.dossier_team_messages (dossier_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_dossier_team_messages_org
  ON app.dossier_team_messages (organization_id, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE app.dossier_team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_team_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dossier_team_messages_read ON app.dossier_team_messages;
CREATE POLICY dossier_team_messages_read ON app.dossier_team_messages FOR SELECT TO authenticated
  USING (
    (organization_id = app.current_organization_id() AND app.is_staff())
    OR dossier_id IN (SELECT app.my_trainer_dossier_ids())
  );

DROP POLICY IF EXISTS dossier_team_messages_write ON app.dossier_team_messages;
CREATE POLICY dossier_team_messages_write ON app.dossier_team_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Où chacun en est de sa lecture : les non-lus de la messagerie.
CREATE TABLE IF NOT EXISTS app.dossier_team_reads (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dossier_id   UUID        NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, dossier_id)
);

ALTER TABLE app.dossier_team_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.dossier_team_reads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dossier_team_reads_read ON app.dossier_team_reads;
CREATE POLICY dossier_team_reads_read ON app.dossier_team_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS dossier_team_reads_write ON app.dossier_team_reads;
CREATE POLICY dossier_team_reads_write ON app.dossier_team_reads FOR ALL TO service_role
  USING (true) WITH CHECK (true);
