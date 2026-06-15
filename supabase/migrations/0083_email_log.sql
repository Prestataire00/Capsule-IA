-- ============================================================================
-- 0083 — Table app.email_log (audit centralisé des envois email) + RLS
-- ============================================================================
-- Contexte : notification. Journal d'audit de TOUS les envois email (Resend),
-- alimenté best-effort/non bloquant depuis le point d'envoi central
-- (shared/lib/email/resend.ts) en service_role. Lecture org-wide pour la page
-- historique. Statut limité à sent/failed : le statut "opened" nécessiterait
-- des webhooks Resend (hors périmètre F-AUT-08).

CREATE TABLE app.email_log (
  id               UUID        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID        REFERENCES app.organizations(id) ON DELETE CASCADE,
  dossier_id       UUID        REFERENCES app.dossiers(id) ON DELETE SET NULL,
  kind             TEXT,        -- ex: 'convocation_j7', 'satisfaction', 'dossier_entree', 'confirmation_preinscription', 'autre'
  recipient        TEXT        NOT NULL,
  subject          TEXT,
  status           TEXT        NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_id      TEXT,        -- id Resend
  error            TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index principal : historique org-wide trié du plus récent au plus ancien.
CREATE INDEX ix_email_log_org_sent ON app.email_log (organization_id, sent_at DESC);

-- Index partiel : drill-down par dossier (filtre ?dossier=<id> de la page).
CREATE INDEX ix_email_log_dossier ON app.email_log (dossier_id) WHERE dossier_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE app.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.email_log FORCE ROW LEVEL SECURITY;

-- Lecture : tout membre de l'organisation.
CREATE POLICY email_log_member_read ON app.email_log FOR SELECT TO authenticated
  USING (organization_id = app.current_organization_id());

-- Écriture : aucune policy INSERT/UPDATE/DELETE intentionnellement.
-- Le journal est alimenté exclusivement par le service_role depuis le serveur
-- (point d'envoi central Resend). FORCE RLS + deny-by-default garantit qu'aucun
-- membre authentifié ne peut forger une trace d'envoi.
