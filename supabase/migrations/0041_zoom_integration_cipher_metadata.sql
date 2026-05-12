-- ============================================================================
-- 0041 — Adaptation tenant_integrations pour chiffrement AES-256-GCM Node natif
-- ============================================================================
-- 0032 prévoyait pgsodium côté Postgres, mais pgsodium n'est pas garanti
-- présent sur toutes les instances Supabase. On bascule sur AES-256-GCM
-- côté Node avec une clé symmétrique en env var (ZOOM_SECRETS_KEY).
--
-- Format de stockage :
--   config_encrypted : ciphertext || authTag (Node crypto natif)
--   config_nonce     : IV 12 bytes (NULL toléré pour rétrocompat)
--   config_key_id    : TEXT (au lieu d'UUID) — identifiant logique de clé
--                      pour rotation future, ex: 'env:zoom_secrets_v1'

ALTER TABLE app.tenant_integrations
  ALTER COLUMN config_key_id TYPE TEXT USING config_key_id::text,
  ALTER COLUMN config_nonce DROP NOT NULL;

COMMENT ON COLUMN app.tenant_integrations.config_encrypted IS
  'AES-256-GCM ciphertext concaténé avec auth tag (16 bytes finaux). Décrypté avec ZOOM_SECRETS_KEY côté Node.';
COMMENT ON COLUMN app.tenant_integrations.config_nonce IS
  'IV 12 bytes (AES-GCM). NULL si chiffrement par autre algorithme.';
COMMENT ON COLUMN app.tenant_integrations.config_key_id IS
  'Identifiant logique de la clé de chiffrement (ex: env:zoom_secrets_v1). Permet rotation.';
