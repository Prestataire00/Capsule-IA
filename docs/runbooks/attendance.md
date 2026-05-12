# Runbook — Émargement / Attendance

> Bounded context `attendance` : feuilles d'émargement Qualiopi, signature électronique apprenant (QR), import présence distanciel (Zoom CSV), finalisation immuable avec PDF horodaté.

## Vue d'ensemble

Trois sources de preuves de présence :

| Source | Cas d'usage | Preuve technique stockée |
|---|---|---|
| **QR présentiel** | Apprenant signe sur son téléphone via lien JWT TTL 24h | PNG signature + SHA-256 + IP + UA + country |
| **CSV Zoom** | Formateur importe le `participants_xxx.csv` après la séance | Hash de la ligne CSV + payload (join/leave/duration) |
| **Trainer override** | Formateur marque absent/excusé manuellement | `evidence_source='trainer_override'` |

Toutes les écritures de signatures passent par la RPC `app.record_attendance_signature` (SECURITY DEFINER, service_role only) — guard JWT en amont, anti-replay JTI en aval.

## Migrations clés

| Migration | Contenu |
|---|---|
| `0026` | Bucket `signatures` (privé) + RPC `get_signature_context` + token JWT TTL 24h (`shared/lib/signature-token.ts`) |
| `0030` | Table `attendance_token_jtis` (anti-replay) + RPC `consume_attendance_token` (P0003) + cron purge expirés |
| `0031` | ALTER `attendance_signatures` (`signer_country`, `evidence_source`, `evidence_payload`) + ALTER `dossier_modules.attendance_split_strategy` |
| `0032` | pgsodium + `tenant_integrations` (Zoom S2S) + `zoom_sync_logs` + `zoom_import_unmatched` + bucket `zoom_imports` |
| `0033` | Triggers immutabilité post-finalization (P0010) sur `attendance_sheets` + `attendance_signatures` |
| `0034` | RPC `record_attendance_signature` v2 (11 args : anti-replay JTI + country + evidence + outbox `infra.domain_events`) |
| `0035` | RLS `tenant_integrations` (admin-only) + `zoom_sync_logs` + `zoom_import_unmatched` |
| `0038` | Bucket `documents` (privé, PDF only) pour PDFs finalisés |

## Rotation du `TOKEN_SIGNING_KEY`

Le token JWT HS256 utilisé pour `/signer/[token]` est signé par `env.TOKEN_SIGNING_KEY` (256+ bits, base64 ou raw).

1. Générer une nouvelle clé : `openssl rand -base64 32`
2. Mettre la nouvelle clé dans Railway env var `TOKEN_SIGNING_KEY_NEXT` (ne supprime pas l'ancienne)
3. Modifier `apps/web/shared/lib/signature-token.ts` pour accepter les deux clés en verify (rolling rotation)
4. Attendre 24h (TTL max d'un token déjà émis)
5. Renommer `TOKEN_SIGNING_KEY_NEXT` → `TOKEN_SIGNING_KEY`, supprimer l'ancienne
6. Retirer l'acceptation legacy dans le code

## Setup Zoom S2S par tenant (V2 / pas encore branché côté Edge Function)

1. Le tenant crée une Server-to-Server OAuth app sur `https://marketplace.zoom.us/develop/create`
2. Scopes minimaux : `meeting:read:past_meeting:admin`, `meeting:read:list_past_meeting_participants:admin`
3. L'admin OF se rend sur `/reglages/integrations/zoom` (à créer côté UI quand prêt)
4. Saisit `accountId`, `clientId`, `clientSecret`
5. Test connexion : `GET /v2/users/me`
6. Secrets chiffrés via pgsodium → `app.tenant_integrations` (admin-only RLS)

## Jobs `pg_cron`

Vérifier qu'ils sont actifs :
```sql
SELECT jobid, jobname, schedule, active
  FROM cron.job
 WHERE jobname LIKE '%attendance%' OR jobname LIKE '%zoom%' OR jobname LIKE '%token%';
```

| Job | Schedule | But |
|---|---|---|
| `attendance_token_jtis_expire_stale` | nightly 03:17 | UPDATE jtis stale → `status='expired'` |
| _(future)_ `zoom_sync_hourly` | hourly | Invocation Edge Function `zoom-sync` |
| _(future)_ `attendance_purge_ip_yearly` | monthly | RGPD : purge IP/UA/country > 5 ans |

## Audit Qualiopi : exporter les preuves d'une feuille

```sql
SELECT s.id AS sheet_id, s.half_day, s.status, s.finalized_at, s.finalized_by, s.document_id,
       sig.participant_kind, sig.learner_id, sig.trainer_id,
       sig.status AS sig_status, sig.signed_at, sig.signer_ip, sig.signer_country,
       sig.signer_user_agent, sig.signature_hash, sig.token_id,
       sig.evidence_source, sig.evidence_payload
  FROM app.attendance_sheets s
  LEFT JOIN app.attendance_signatures sig ON sig.attendance_sheet_id = s.id
 WHERE s.dossier_id = '<dossier-uuid>'
 ORDER BY s.created_at, sig.created_at;
```

## Audit Qualiopi : récupérer le PDF finalisé

```sql
SELECT d.id, d.storage_path, d.file_hash, d.generated_at,
       d.metadata->>'attendance_sheet_id' AS sheet_id
  FROM app.documents d
 WHERE d.kind = 'feuille_emargement_signee'
   AND d.metadata->>'attendance_sheet_id' = '<sheet-uuid>';
```

Le `storage_path` est dans le bucket privé `documents`. Pour générer une signed URL (60s) côté code : `getDocumentDownloadUrl({ documentId })`.

## Incidents fréquents

| Symptôme | Cause probable | Action |
|---|---|---|
| `token_already_consumed` (P0003) | Apprenant a actualisé la page après signature, ou ouvert 2 onglets | Régénérer un nouveau QR/lien depuis la page formateur |
| `token_already_expired` (P0003) | TTL 24h dépassé | Régénérer |
| `attendance_sheet_finalized_no_update` (P0010) | Tentative de modif sur sheet finalisée | Refuser — la feuille est immuable par design Qualiopi |
| RPC v2 `rpc_failed: function ... does not exist` | Migration 0034 pas encore appliquée | Vérifier déploiement Railway |
| Sync Zoom S2S échoue avec 401 | Secret tourné côté Zoom | Tenant re-saisit credentials sur `/reglages/integrations/zoom` |
| PDF cold start lent (> 2s) | @react-pdf/renderer cold start Railway | Bench, fallback Edge Function dédiée si récurrent |
| IP `0.0.0.0` dans `signer_ip` | Headers proxy mal forwardés | Vérifier Railway proxy → Next.js (cf-connecting-ip, x-forwarded-for) |
| CSV Zoom unmatched élevé | Apprenants utilisent un email différent sur Zoom | Lier manuellement via UI unmatched, ou aligner emails OF/Zoom |

## Conformité RGPD

- **IP, UA, country** des signataires : durée légale d'archivage Qualiopi = 5 ans, puis purge auto (job `attendance_purge_ip_yearly` à programmer).
- **PNG signatures** : conservés indéfiniment (preuves Qualiopi/CPF). Bucket `signatures` privé.
- **CSV Zoom bruts** : bucket `zoom_imports` privé, conservés indéfiniment pour audit.
- **PDFs finalisés** : bucket `documents` privé, immuables.

## Tests rapides

```bash
# Tests unit (Vitest) - depuis apps/web/
pnpm test features/attendance/

# Test du parser CSV
pnpm test features/attendance/__tests__/zoom-csv-parser
```

## Architecture côté code

```
apps/web/
├── features/attendance/
│   ├── domain/                  # entities, VOs, materialize, errors, events
│   ├── generate-signature-url.ts   # helper construction URL signée
│   ├── pdf-render.tsx              # @react-pdf/renderer + AttendancePdfInput
│   ├── zoom-csv-parser.ts          # Papa.parse + aliases tolérants
│   └── __tests__/
├── app/(apprenant)/signer/[token]/
│   ├── page.tsx                    # preview RSC + form client
│   ├── actions.ts                  # recordSignature (RPC v2)
│   └── signer-form.tsx             # canvas signature
└── app/(dashboard)/dossiers/[id]/emargements/[sessionId]/
    ├── page.tsx                    # stats + ParticipantsList + ZoomPanel + FinalizeButton
    ├── actions.ts                  # ensure/generate/import/finalize/download
    ├── participants-list.tsx       # liste + bouton génération QR
    ├── zoom-import-panel.tsx       # drop CSV + résultat
    └── finalize-button.tsx         # bouton + état finalisé + download
```

Le bounded context `attendance` suit une convention **pragmatique** : actions inline dans les routes (`app/.../actions.ts`), helpers techniques dans `features/attendance/`, domain TS pur réutilisable. Pas de couche application/infrastructure séparée — c'est volontaire pour ce contexte (overhead évité, code plus facile à lire).
