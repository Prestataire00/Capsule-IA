# Runbook — Activation du backfill Zoom (cron externe)

## But
Planifier l'appel automatique du backfill Zoom pour ne plus dépendre de l'upload CSV
manuel par session. Le code est dans `apps/web/app/api/cron/zoom-sync/route.ts`.

## Endpoint
- Méthode : `POST` (ou `GET`, supporté pour les schedulers GET-only)
- URL : `https://<DOMAINE_PROD>/api/cron/zoom-sync`
- Auth : header `Authorization: Bearer <CRON_SECRET>`
  (variable d'env déjà utilisée par `transactional-emails`).

## Fréquence recommandée
- 1×/nuit (ex. `30 2 * * *`). La fenêtre couvre les sessions terminées entre
  il y a 25 jours et il y a 30 minutes ; une exécution quotidienne suffit largement
  à rester dans la rétention Zoom (~30 j).

## Procédure (même outil que les autres crons : cron-job.org / Railway)
1. Créer un job HTTP planifié `30 2 * * *`.
2. Méthode `POST`, URL ci-dessus.
3. Header `Authorization: Bearer <CRON_SECRET>`.
4. Sauvegarder, déclencher un run manuel de test.

## Vérification
- La réponse JSON contient `{ ok: true, processed, summary }`.
- Dans le dashboard `/emargements`, la couverture preuve Zoom doit augmenter et les
  "heures à risque récupérables" diminuer au fil des nuits.
- Côté DB : `SELECT status, count(*) FROM app.zoom_sync_logs GROUP BY status;`.

## Pré-requis tenant
- Chaque organisation doit avoir une intégration `app.tenant_integrations(kind='zoom_s2s', status='active')`
  avec des credentials valides ; sinon les sessions ressortent en `skipped`.
