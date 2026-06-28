-- ============================================================================
-- 0105 — Intégrations Google par UTILISATEUR (et non par organisation)
-- ============================================================================
-- Chaque membre connecte son propre Google Agenda : les sessions qu'il planifie
-- créent le Meet sur SON agenda (son adresse @org). Refresh token chiffré
-- (AES-256-GCM, clé ZOOM_SECRETS_KEY), une ligne par (user_id, kind).
-- ============================================================================

CREATE TABLE app.user_integrations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('google_calendar')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  account_email TEXT,
  config_encrypted BYTEA NOT NULL,
  config_nonce BYTEA NOT NULL,
  config_key_id TEXT NOT NULL,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind)
);
CREATE INDEX ix_user_integrations_user ON app.user_integrations (user_id, kind);

ALTER TABLE app.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_integrations FORCE ROW LEVEL SECURITY;

-- Chaque utilisateur ne gère que ses propres intégrations.
CREATE POLICY ui_select ON app.user_integrations FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY ui_insert ON app.user_integrations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY ui_update ON app.user_integrations FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY ui_delete ON app.user_integrations FOR DELETE TO authenticated
  USING (user_id = auth.uid());
