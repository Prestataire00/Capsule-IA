-- ============================================================================
-- 0118 — Table app.email_schedules (programmation d'envois d'emails) + RLS
-- ============================================================================
-- Contexte : communication. Règles paramétrables par l'organisme pour programmer
-- l'envoi automatique d'emails relatifs à une date d'un dossier (ex. « rappel 3
-- jours avant le début de la 1ère session »). Évaluées par le cron quotidien
-- (app/api/cron/transactional-emails) qui calcule, pour chaque règle active,
-- l'ancre = aujourd'hui - offset_days, trouve les dossiers concernés, et envoie
-- (anti-doublon via app.email_log kind = 'schedule:<id>').
--
--   anchor         : la date de référence du dossier
--                    - first_session_start : début de la 1ère session
--                    - dossier_start        : date d'entrée en formation (start_date)
--                    - dossier_end          : date de fin de formation (end_date)
--   offset_days    : décalage en jours (négatif = AVANT l'ancre, positif = APRÈS)
--   recipient_kind : learner (apprenant du dossier) | trainer (formateurs du dossier)
--   subject/body   : texte avec variables {prenom} {nom} {formation} {date}

CREATE TABLE app.email_schedules (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  anchor           TEXT        NOT NULL CHECK (anchor IN ('first_session_start', 'dossier_start', 'dossier_end')),
  offset_days      INT         NOT NULL DEFAULT 0 CHECK (offset_days BETWEEN -365 AND 365),
  recipient_kind   TEXT        NOT NULL CHECK (recipient_kind IN ('learner', 'trainer')),
  subject          TEXT        NOT NULL,
  body             TEXT        NOT NULL,
  enabled          BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- Liste par organisation (règles vivantes).
CREATE INDEX ix_email_schedules_org ON app.email_schedules (organization_id) WHERE deleted_at IS NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE app.email_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.email_schedules FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation.
CREATE POLICY email_schedules_read ON app.email_schedules FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- Écriture : staff (owner / admin / gestionnaire) de l'organisation.
-- Le cron lit/écrit en service_role (RLS contournée) — aucune policy nécessaire pour lui.
CREATE POLICY email_schedules_write ON app.email_schedules FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id() AND app.is_staff())
  WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
