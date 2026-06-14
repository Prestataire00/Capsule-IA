# Espace apprenant — Replays Zoom (#2/3)

**Date :** 2026-06-14 · **Statut :** design validé (décisions actées avec le porteur) · **Base :** stacké sur #1 `feat/espace-ressources-tracabilite` (migrations 0063-0066).

## Contexte / décisions

Sous-projet #2. L'intégration Zoom S2S existe et est robuste (chiffrement AES-256-GCM `zoom-secrets-cipher.ts`, client paginé `zoom-api-client.ts`, cron `zoom-sync` avec précédence humaine sur présences). `app.sessions` a `zoom_meeting_id`, `zoom_join_url`, `remote_url`. **Aucun recording** n'est récupéré aujourd'hui ; le bouton « Replay » de l'espace est mock.

**Décisions :**
1. **On stocke le lien cloud Zoom (`play_url` + passcode), pas le fichier vidéo** — pas de téléchargement de Go dans Storage (coût/limites). Caveat assumé : soumis à la rétention Zoom.
2. Table dédiée **session-scoped** (`app.session_recordings`), pas le modèle `module_resources` de #1 (qui est module-scoped).
3. Traçabilité via le journal unifié de #1 : `resource_access_log` avec `target_kind='replay'` (déjà prévu dans le CHECK).
4. Ingestion : **cron étendu** (automatique après sync présences) **+ action manuelle** gestionnaire (« Récupérer le replay »).

## Modèle de données

`supabase/migrations/0067_session_recordings.sql` :
```sql
CREATE TABLE app.session_recordings (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id       UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  source           TEXT NOT NULL DEFAULT 'zoom' CHECK (source IN ('zoom','manual')),
  external_id      TEXT,                       -- recording id Zoom (idempotence)
  play_url         TEXT NOT NULL,
  passcode         TEXT,
  duration_seconds INT CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  recorded_at      TIMESTAMPTZ,
  is_published     BOOLEAN NOT NULL DEFAULT true,   -- visible apprenant
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL,
  UNIQUE (session_id, external_id)
);
CREATE INDEX ix_session_recordings_org_session ON app.session_recordings(organization_id, session_id) WHERE deleted_at IS NULL;
-- RLS enable+force ; SELECT = app.current_organization_id() ; INSERT/UPDATE/DELETE = + app.is_staff()
-- (calque exact des policies app.modules / module_resources de #1)
```
pgTAP : `supabase/tests/0067_test_session_recordings_rls.sql` (isolation tenant + anon no-access). Mêmes helpers que #1.

## Backend

- `apps/web/features/attendance/zoom-api-client.ts` : ajouter `fetchMeetingRecordings(creds, meetingId): Promise<ZoomRecording[]>` → `GET /meetings/{meetingId}/recordings` ; mapper `recording_files[]` (filtrer `recording_type='shared_screen_with_speaker_view'` ou `file_type='MP4'`) → `{ externalId, playUrl, passcode (= meeting.recording_play_passcode/password), durationSeconds, recordedAt }`. Gérer `ZoomApiError` (`recording_not_found` quand 404).
- `apps/web/features/attendance/persist-session-recording.ts` (helper réutilisable cron + action) : upsert dans `session_recordings` par `(session_id, external_id)` via client service_role passé en paramètre.
- Cron `apps/web/app/api/cron/zoom-sync/route.ts` : après la sync participants d'une session, appeler `fetchMeetingRecordings` + persister (best-effort, n'interrompt pas la sync présences si erreur recording).
- Action gestionnaire `apps/web/app/(dashboard)/dossiers/[id]/sessions/recording-actions.ts` (`authActionClient`) : `fetchSessionRecording({ sessionId })` → lit `zoom_meeting_id` de la session (org courante), appelle l'API, persiste. + `toggleRecordingPublish`.

## Livraison apprenant

Route `apps/web/app/api/espace/[token]/replay/[sessionId]/route.ts` (GET) :
- Vérifie le JWT apprenant (sinon 401).
- service_role : charge la `session_recordings` publiée la plus récente de `session_id`, vérifie que la session appartient au dossier de l'apprenant (`sessions.dossier_id = token.dossierId` — ou via `session_dossiers` si sessions partagées). 404 sinon.
- `logResourceAccess({token, targetKind:'replay', targetId: recording.id, action:'download'})` (helper de #1).
- Redirige vers `play_url` (avec passcode en fragment si présent, sinon affiché à part).

Espace : `apps/web/app/(apprenant)/espace/[token]/sessions/page.tsx` — remplacer le bouton replay mock par un lien réel `/api/espace/${token}/replay/${session.id}` affiché uniquement si un recording publié existe. Étendre le resolver apprenant (RPC `get_apprenant_resources` de #1 OU une requête dédiée) pour indiquer quelles sessions ont un replay.

## Ordre / tests / vérif

1. Migration 0067 + RLS + pgTAP. 2. `fetchMeetingRecordings` + tests unit du mapper (fixture JSON Zoom). 3. persist helper + action + cron. 4. route replay + wiring espace. 5. build + unit.
- **Vérif** : `pnpm --filter web build` + Vitest (mapper). Migrations/pgTAP : staging via API Management (Docker down) — voir [[project_ia_infinity_staging]].

## Hors-scope
Archivage du fichier vidéo dans Storage ; transcription ; recordings multi-fichiers (on prend le MP4 principal).
