-- Une discussion d'équipe pour une séance sans dossier.
--
-- La messagerie d'équipe (0204) est classée par dossier. Une séance planifiée
-- pour un client, sans dossier — ses stagiaires inscrits directement — n'avait
-- donc aucune discussion possible : l'onglet « Messages » de la séance
-- doublait la messagerie avec un second fil, ailleurs. Demande d'Ismael le
-- 2026-10-05 : un seul endroit, la messagerie, et un bouton depuis la séance.
--
-- Un fil appartient désormais à un dossier OU à une séance, jamais aux deux.
-- `fil_id` est l'identifiant du fil, quel qu'il soit : c'est lui que lisent
-- l'écran et les lectures.

ALTER TABLE app.dossier_team_messages
  ALTER COLUMN dossier_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES app.sessions(id) ON DELETE CASCADE;

ALTER TABLE app.dossier_team_messages
  DROP CONSTRAINT IF EXISTS dossier_team_messages_un_fil;
ALTER TABLE app.dossier_team_messages
  ADD CONSTRAINT dossier_team_messages_un_fil CHECK ((dossier_id IS NULL) <> (session_id IS NULL));

ALTER TABLE app.dossier_team_messages
  ADD COLUMN IF NOT EXISTS fil_id UUID GENERATED ALWAYS AS (COALESCE(dossier_id, session_id)) STORED;

CREATE INDEX IF NOT EXISTS ix_dossier_team_messages_fil
  ON app.dossier_team_messages (fil_id, created_at) WHERE deleted_at IS NULL;

-- Les lectures suivent le fil, plus le seul dossier. La clé primaire tombe
-- d'abord : une colonne de clé primaire ne peut pas devenir facultative.
ALTER TABLE app.dossier_team_reads DROP CONSTRAINT IF EXISTS dossier_team_reads_pkey;
ALTER TABLE app.dossier_team_reads
  ALTER COLUMN dossier_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES app.sessions(id) ON DELETE CASCADE;

ALTER TABLE app.dossier_team_reads
  DROP CONSTRAINT IF EXISTS dossier_team_reads_un_fil;
ALTER TABLE app.dossier_team_reads
  ADD CONSTRAINT dossier_team_reads_un_fil CHECK ((dossier_id IS NULL) <> (session_id IS NULL));

ALTER TABLE app.dossier_team_reads
  ADD COLUMN IF NOT EXISTS fil_id UUID GENERATED ALWAYS AS (COALESCE(dossier_id, session_id)) STORED;

ALTER TABLE app.dossier_team_reads ADD CONSTRAINT dossier_team_reads_pkey PRIMARY KEY (user_id, fil_id);

-- Le formateur lit aussi le fil de ses séances.
DROP POLICY IF EXISTS dossier_team_messages_read ON app.dossier_team_messages;
CREATE POLICY dossier_team_messages_read ON app.dossier_team_messages FOR SELECT TO authenticated
  USING (
    (organization_id = app.current_organization_id() AND app.is_staff())
    OR dossier_id IN (SELECT app.my_trainer_dossier_ids())
    OR session_id IN (SELECT app.my_trainer_session_ids())
  );
