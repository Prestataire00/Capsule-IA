-- Questionnaires cochés sur une séance, et destinataire d'un modèle.
--
-- Demande d'Ismael le 2026-09-27 : « créer n'importe quel questionnaire » et,
-- sur une séance, cocher ceux qui doivent partir — chacun à son moment (J-7
-- avant le début, J+1 après la fin…), comme dans les outils qu'il connaît.
--
-- 1. `questionnaire_templates.audience` : à qui s'adresse le modèle. Un
--    questionnaire personnalisé partait d'office au stagiaire — le destinataire
--    se déduisait du seul `kind`, et « Personnalisé » ne dit rien. NULL = on
--    garde la déduction (modèles existants, modèles système).
--
-- 2. `session_questionnaires` : un modèle programmé sur une séance. Pas de
--    ligne = pas d'envoi. `sent_at` fait foi : le cron ne repart pas deux fois.

ALTER TABLE app.questionnaire_templates
  ADD COLUMN IF NOT EXISTS audience TEXT
  CHECK (audience IS NULL OR audience IN ('apprenant', 'entreprise', 'formateur', 'financeur'));

COMMENT ON COLUMN app.questionnaire_templates.audience IS
  'Destinataire choisi à la création (apprenant, entreprise, formateur, financeur). NULL = déduit du kind et du code.';

CREATE TABLE IF NOT EXISTS app.session_questionnaires (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id       UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  template_id      UUID        NOT NULL REFERENCES app.questionnaire_templates(id) ON DELETE CASCADE,
  -- Le moment se lit par rapport au début ou à la fin de la séance.
  ancre            TEXT        NOT NULL CHECK (ancre IN ('debut', 'fin')),
  decalage_jours   INTEGER     NOT NULL CHECK (decalage_jours BETWEEN -90 AND 365),
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  sent_at          TIMESTAMPTZ,
  -- Dernier bilan d'envoi, lisible à l'écran (« 3 envoyés, 1 sans adresse »).
  bilan            TEXT,
  updated_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, template_id)
);

CREATE INDEX IF NOT EXISTS ix_session_questionnaires_a_envoyer
  ON app.session_questionnaires (session_id)
  WHERE enabled AND sent_at IS NULL;

ALTER TABLE app.session_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_questionnaires FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_questionnaires_read ON app.session_questionnaires;
CREATE POLICY session_questionnaires_read ON app.session_questionnaires FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- Écriture en service role : les Server Actions gardent le rôle avant d'écrire.
DROP POLICY IF EXISTS session_questionnaires_write ON app.session_questionnaires;
CREATE POLICY session_questionnaires_write ON app.session_questionnaires FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE app.session_questionnaires IS
  'Questionnaires cochés sur une séance, avec leur moment d''envoi. sent_at renseigné = parti.';
