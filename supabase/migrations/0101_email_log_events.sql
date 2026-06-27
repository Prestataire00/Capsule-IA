-- 0101_email_log_events.sql
-- Traçabilité fine des emails via webhooks Resend (delivered / opened / clicked /
-- bounced / complained). On enrichit app.email_log avec des horodatages d'événements
-- mis à jour par l'endpoint /api/webhooks/resend (service_role), matchés par provider_id.

ALTER TABLE app.email_log
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count   INT NOT NULL DEFAULT 0;

-- Lookup par identifiant Resend (provider_id) pour le webhook.
CREATE INDEX IF NOT EXISTS ix_email_log_provider ON app.email_log (provider_id)
  WHERE provider_id IS NOT NULL;
