-- Réglage des envois automatiques par l'organisme.
--
-- Les délais étaient écrits dans le code : convocation à sept jours, satisfaction
-- le lendemain de la fin. Un organisme qui voulait convoquer quinze jours avant,
-- ou laisser trois jours avant de demander un avis, n'avait aucun moyen de le
-- dire — et couper un envoi n'était possible que séance par séance (0156), ce
-- qui oblige à y penser à chaque séance créée.
--
-- Une ligne = un réglage explicite pour un type d'envoi. **Pas de ligne = le
-- réglage d'origine du code.** Régler est donc un acte volontaire : rien ne
-- change pour les organismes qui ne touchent à rien, et un défaut modifié dans
-- le code profite à tous ceux qui n'ont rien surchargé.
--
-- Articulation avec 0156 : ici c'est l'organisme (« jamais de retour formateur
-- chez nous »), là c'est la séance (« pas pour celle-ci »). Couper à l'un des
-- deux niveaux suffit à empêcher l'envoi.

CREATE TABLE IF NOT EXISTS app.email_automation_rules (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  -- Le `kind` écrit dans app.email_log : c'est lui qui relie le réglage, le
  -- code qui envoie, et la trace de l'envoi.
  kind             TEXT        NOT NULL CHECK (kind ~ '^[a-z_]+$'),
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  -- Nombre de jours entre la date pivot (début de séance, fin de dossier,
  -- échéance) et l'envoi. Le sens — avant ou après — appartient au type
  -- d'envoi, pas au réglage : une convocation est toujours avant, un
  -- questionnaire de satisfaction toujours après. Stocker un signe ici
  -- permettrait d'exprimer « convoquer trois jours APRÈS la séance ».
  delay_days       SMALLINT    NOT NULL DEFAULT 0 CHECK (delay_days BETWEEN 0 AND 90),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT email_automation_rules_unique UNIQUE (organization_id, kind)
);

-- Le cron lit tous les réglages d'un type d'envoi, tous organismes confondus.
CREATE INDEX IF NOT EXISTS ix_email_automation_rules_kind
  ON app.email_automation_rules (kind);

ALTER TABLE app.email_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.email_automation_rules FORCE ROW LEVEL SECURITY;

-- Lecture : les membres de l'organisme, pour afficher l'écran de réglage.
DROP POLICY IF EXISTS email_automation_rules_select ON app.email_automation_rules;
CREATE POLICY email_automation_rules_select ON app.email_automation_rules
  FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- Écriture : service role. La Server Action vérifie le rôle avant d'écrire —
-- régler les envois de tout l'organisme n'est pas un geste de tous les jours.
DROP POLICY IF EXISTS email_automation_rules_write ON app.email_automation_rules;
CREATE POLICY email_automation_rules_write ON app.email_automation_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.email_automation_rules IS
  'Réglage par organisme d''un envoi automatique. Pas de ligne = réglage d''origine du code.';
COMMENT ON COLUMN app.email_automation_rules.kind IS
  'Type d''envoi, identique au kind écrit dans app.email_log.';
COMMENT ON COLUMN app.email_automation_rules.delay_days IS
  'Jours entre la date pivot et l''envoi. Le sens (avant/après) est porté par le type d''envoi.';
