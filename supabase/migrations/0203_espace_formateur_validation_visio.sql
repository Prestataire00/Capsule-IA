-- ============================================================================
-- 0203 — Espace formateur : qui valide le cours, et la boîte formateur
-- ============================================================================
-- 1. Destinataires de la validation des cours et supports déposés par les
--    formateurs : les « validateurs » décident, la « copie » est tenue au
--    courant. Sans ligne, la direction (owner/admin) valide comme avant.
-- 2. Agenda Google de l'ORGANISME (une boîte formateur générique) : quand il
--    est connecté, c'est lui qui organise les Meet des séances — les outils
--    d'enregistrement branchés sur cette boîte (tl;dv, Lexi) rejoignent alors
--    toutes les visios. Sans ligne, l'agenda de la personne qui planifie sert,
--    comme avant (0105).
-- Lecture par l'organisme ; écriture par le serveur seul, après contrôle du rôle.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app.course_validation_recipients (
  organization_id UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('validateur', 'copie')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE app.course_validation_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.course_validation_recipients FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_validation_recipients_read ON app.course_validation_recipients;
CREATE POLICY course_validation_recipients_read ON app.course_validation_recipients FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff());

DROP POLICY IF EXISTS course_validation_recipients_write ON app.course_validation_recipients;
CREATE POLICY course_validation_recipients_write ON app.course_validation_recipients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS app.organization_google_calendar (
  organization_id  UUID        PRIMARY KEY REFERENCES app.organizations(id) ON DELETE CASCADE,
  account_email    TEXT,
  config_encrypted BYTEA       NOT NULL,
  config_nonce     BYTEA       NOT NULL,
  config_key_id    TEXT        NOT NULL,
  connected_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  last_test_at     TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app.organization_google_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_google_calendar FORCE ROW LEVEL SECURITY;

-- Le jeton est chiffré, mais il reste un secret : la direction seule voit la ligne.
DROP POLICY IF EXISTS organization_google_calendar_read ON app.organization_google_calendar;
CREATE POLICY organization_google_calendar_read ON app.organization_google_calendar FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

DROP POLICY IF EXISTS organization_google_calendar_write ON app.organization_google_calendar;
CREATE POLICY organization_google_calendar_write ON app.organization_google_calendar FOR ALL TO service_role
  USING (true) WITH CHECK (true);
