-- Les liens d'émargement partent 10 minutes avant le début de chaque
-- demi-journée (demande d'Ismael le 2026-10-07). Toutes les 10 minutes, le
-- cron pouvait les envoyer jusqu'à 10 minutes en retard sur ce rendez-vous :
-- il passe désormais toutes les 5 minutes (même nom de tâche : pg_cron la
-- remplace).

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule('capsule_emargement_liens', '*/5 * * * *',
      $c$SELECT app.call_cron_endpoint('/api/cron/emargement-liens')$c$);
  END IF;
END
$do$;
