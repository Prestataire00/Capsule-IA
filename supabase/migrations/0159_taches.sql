-- Tâches internes : créer une tâche et l'attribuer à soi-même ou à un membre de
-- l'équipe. Rien de tel n'existait — `improvement_actions` est réservé au plan
-- d'amélioration Qualiopi et `dossier_funder_tasks` aux démarches financeurs.
--
-- Une tâche peut pointer un dossier ou une séance : c'est là que le travail se
-- fait, et la fiche concernée reste retrouvable depuis la tâche.

CREATE TABLE IF NOT EXISTS app.tasks (
  id                UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id   UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  title             TEXT        NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description       TEXT        CHECK (description IS NULL OR length(description) <= 4000),
  -- NULL = tâche non attribuée (à prendre).
  assignee_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  priority          TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date          DATE,
  done_at           TIMESTAMPTZ,
  dossier_id        UUID        REFERENCES app.dossiers(id) ON DELETE SET NULL,
  session_id        UUID        REFERENCES app.sessions(id) ON DELETE SET NULL,
  created_by        UUID        REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ NULL
);

-- Liste de l'organisme (vue par défaut : à faire, du plus urgent au plus tard).
CREATE INDEX IF NOT EXISTS ix_tasks_org_status
  ON app.tasks (organization_id, status, due_date) WHERE deleted_at IS NULL;
-- « Mes tâches » et le badge de la barre latérale.
CREATE INDEX IF NOT EXISTS ix_tasks_assignee
  ON app.tasks (assignee_user_id, status) WHERE deleted_at IS NULL;

ALTER TABLE app.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tasks FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation. Une tâche d'équipe n'a pas de secret,
-- et chacun doit pouvoir voir qui fait quoi.
DROP POLICY IF EXISTS tasks_select ON app.tasks;
CREATE POLICY tasks_select ON app.tasks FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND deleted_at IS NULL);

-- Écriture : service role uniquement (les Server Actions gardent le rôle et
-- l'organisation avant d'écrire), comme les autres réglages sensibles.
DROP POLICY IF EXISTS tasks_write ON app.tasks;
CREATE POLICY tasks_write ON app.tasks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.tasks IS
  'Tâches internes attribuables aux membres de l''organisation (hors plan Qualiopi).';
