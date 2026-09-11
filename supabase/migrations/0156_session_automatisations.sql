-- Automatisations par séance : chaque envoi automatique peut être coupé pour UNE
-- séance, sans toucher aux réglages de l'organisme ni aux autres séances.
--
-- Absence de ligne = envoi actif (comportement actuel préservé). Une ligne
-- `enabled = false` coupe l'envoi ; les crons interrogent le helper ci-dessous.

CREATE TABLE IF NOT EXISTS app.session_automation_settings (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id       UUID        NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  -- Envoi visé : clé intégrée ('convocation', 'emargement_liens', 'satisfaction',
  -- 'fin_formation', 'retour_formateur', 'attestation_entree', 'alerte_emargement')
  -- ou programmation de l'organisme ('schedule:<uuid>').
  key              TEXT        NOT NULL CHECK (key ~ '^[a-z_]+(:[0-9a-f-]{36})?$'),
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  updated_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, key)
);

CREATE INDEX IF NOT EXISTS ix_session_automation_session
  ON app.session_automation_settings (session_id);

ALTER TABLE app.session_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.session_automation_settings FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation.
DROP POLICY IF EXISTS session_automation_read ON app.session_automation_settings;
CREATE POLICY session_automation_read ON app.session_automation_settings FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- Écriture : réservée au service role (les Server Actions gardent le rôle avant
-- d'écrire), comme les autres réglages sensibles.
DROP POLICY IF EXISTS session_automation_write ON app.session_automation_settings;
CREATE POLICY session_automation_write ON app.session_automation_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Un envoi est actif tant qu'il n'a pas été coupé explicitement pour la séance.
CREATE OR REPLACE FUNCTION app.session_automation_enabled(p_session_id UUID, p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COALESCE(
    (SELECT s.enabled
       FROM app.session_automation_settings s
      WHERE s.session_id = p_session_id AND s.key = p_key),
    true
  );
$$;

REVOKE ALL ON FUNCTION app.session_automation_enabled(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.session_automation_enabled(UUID, TEXT) TO authenticated, service_role;

COMMENT ON TABLE app.session_automation_settings IS
  'Envois automatiques coupés pour une séance donnée (absence de ligne = actif).';
