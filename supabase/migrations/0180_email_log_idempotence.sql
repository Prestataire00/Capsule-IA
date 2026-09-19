-- 0180 — Un e-mail transactionnel ne peut plus partir deux fois
--
-- Constat (audit du 19/09/2026) : `app.email_log` n'avait aucune contrainte
-- d'unicité. Les déduplications existantes étaient des `SELECT` puis `continue`
-- — un motif lire-puis-écrire qui ne résiste ni à deux passages du cron le même
-- jour, ni à un rejeu HTTP, ni à deux instances en parallèle. Et trois envois
-- ne vérifiaient rien du tout : convocation J-7, enquête de satisfaction, fin
-- de formation. Un apprenant, ou l'entreprise cliente, recevait alors deux fois
-- le même courrier.
--
-- Le remède est celui déjà employé pour les événements de domaine
-- (`infra.processed_events`, 0014) : c'est la base qui arbitre, par une
-- contrainte, et non le code par une lecture préalable.
--
-- Fonctionnement : l'émetteur RÉSERVE sa clé (insertion `pending`) avant
-- d'envoyer. Si la clé existe déjà, l'insertion échoue (23505) et l'envoi
-- n'a pas lieu. L'échec d'envoi libère la clé, pour qu'une reprise reste
-- possible — un envoi qui n'est pas parti doit pouvoir repartir.
--
-- Rejouable sans risque.

ALTER TABLE app.email_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- `pending` = clé réservée, envoi en cours. L'état final reste sent/failed.
ALTER TABLE app.email_log DROP CONSTRAINT IF EXISTS email_log_status_check;
ALTER TABLE app.email_log ADD CONSTRAINT email_log_status_check
  CHECK (status IN ('pending', 'sent', 'failed'));

-- Index partiel : les envois sans clé (notifications ponctuelles, envois
-- manuels) ne sont pas concernés et peuvent se répéter légitimement.
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_log_idempotency
  ON app.email_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN app.email_log.idempotency_key IS
  'Clé de réservation d''un envoi unique (ex. convocation_j7:<session>:<apprenant>:<jour>). Réservée AVANT l''envoi : l''unicité est arbitrée par la base, jamais par une lecture préalable. NULL pour les envois qui peuvent légitimement se répéter.';
