# Émargement par demi-journée — Design

**Date** : 2026-05-11
**Statut** : Spec validée, prêt pour writing-plans
**Bounded context** : `attendance` (nouveau)
**Aggregate touchés** : `AttendanceSheet` (root), `Signature`, `SignerToken`, `ZoomImport`

---

## 1. Problème

Qualiopi (Indicateur 11) et le contrôle CPF/CDC exigent une preuve d'assiduité granulaire à la **demi-journée** avec :

- Identification claire du participant
- Date et durée
- Preuve technique horodatée et "infalsifiable" depuis 2023 (CDC)
- Pour le distanciel : logs de connexion ou attestation équivalente

Le scaffolding DB existe (tables `sessions`, `attendance_sheets` avec `half_day`, `attendance_signatures` avec `signer_ip`/`signer_user_agent`/`signature_hash`/`token_id`, bucket `signatures`, RPC `get_signature_context`, JWT HS256 TTL 24h, colonnes `zoom_meeting_id`/`zoom_metadata` sur `sessions`). Les 3 routes UI principales (`/emarger/[id]`, `/signer/[token]`, `/emargements`) existent en **mocks pleins**.

Le `features/attendance/` est vide : pas de domain, pas d'application, pas d'infra, pas de logique réelle.

## 2. Décisions structurantes (validées avec utilisateur)

| Sujet | Décision |
|---|---|
| Pipeline Zoom | **Les deux** : CSV par défaut (V1) + API S2S OAuth optionnelle par tenant (V1) |
| Découpage demi-journées | **Auto par règle (split 12h)** + champ `attendance_split_strategy` sur `dossier_modules` pour override `per_day` ou `manual` |
| Modèle QR présentiel | **QR individuel par apprenant** affiché à la demande sur l'écran formateur (pas de carrousel auto, pas de mail J-1 en V1) |
| Renforcement sécurité | TTL 30 min QR live, capture IP+UA+country (`cf-ipcountry`), signature manuscrite obligatoire (canvas PNG, hash SHA-256), anti-replay JTI |
| Approche d'architecture | **B — Domain Next.js + Repository Supabase** (DDD light, aligné CLAUDE.md). Pas de fragmentation en lots. |

## 3. Architecture

### 3.1 Bounded context

`features/attendance/` — 4 couches strictes (domain / application / infrastructure / ui), aucune dépendance externe dans `domain`.

**Ports** : `AttendanceSheetRepository`, `TokenSigner` (JWT HS256), `IpResolver`, `PdfRenderer`, `ZoomImporter` (CSV), `ZoomApiClient` (S2S).

**Adaptateurs** vers les contexts voisins :
- `scheduling` (lecture `sessions` + `session_participants`)
- `dossier` (lecture `dossier_modules.attendance_split_strategy`)
- `documents` (création row + PDF stocké)
- `notification` (V2 : emails J-1)

### 3.2 Entités et value objects

```
AttendanceSheet (aggregate root)
  id: AttendanceSheetId
  organizationId: OrganizationId
  dossierId: DossierId
  sessionId: SessionId
  halfDay: HalfDay
  status: 'open' | 'partial' | 'completed' | 'finalized'
  splitStrategy: 'auto' | 'per_day' | 'manual'
  signatures: Signature[]
  finalizedAt?, finalizedBy?, documentId?

Signature (entity dans aggregate)
  id: SignatureId
  signerKind: 'learner' | 'trainer'
  signerId: LearnerId | TrainerId
  status: 'present' | 'absent' | 'late' | 'excused' | null
  signedAt?
  signerIp?, signerUserAgent?, signerCountry?
  signaturePngPath?, signatureHash?
  tokenJti?
  evidenceSource: 'manual' | 'qr' | 'zoom_csv' | 'zoom_api' | 'trainer_override'
  evidencePayload?: JSONB
  notes?

HalfDay = 'morning' | 'afternoon' | 'full' | 'evening'   (déjà DB, immuable)
SignerToken (VO) = { sheetId, signerId, signerKind, jti, exp }
```

Tous les IDs sont branded (`AttendanceSheetId`, `SignatureId`, `TokenJti`).

### 3.3 Invariants métier (testés Vitest, pas pgTAP)

1. **Couverture** : la durée cumulée des sheets d'une session = durée de la session (`Σ halfDays.duration == session.duration`).
2. **Unicité** : un `(sheetId, signerKind, signerId)` ⇒ une seule `Signature` (déjà `UNIQUE` DB).
3. **Anti-replay** : un `tokenJti` ne peut être consommé qu'une fois.
4. **Immutabilité** : `AttendanceSheet.status = 'finalized'` rejette toute modification descendante (trigger SQL `RAISE EXCEPTION`).
5. **Pré-finalisation** : la finalisation exige `status ≠ null` sur toutes les signatures requises.
6. **Cohérence preuve** : `signature.status = 'present'` ⇒ `signed_at` et `signer_ip` et (`signature_hash` OU `evidence_source ∈ {zoom_csv, zoom_api}`) tous non null.

### 3.4 Events (outbox `infra.domain_events`)

- `AttendanceSheetCreated` (à l'init de session)
- `SignatureRecorded` (à chaque signature, déclenche realtime push)
- `AttendanceSheetFinalized` (après PDF + insert documents)
- `ZoomAttendanceImported` (après CSV ou API)

## 4. Flows critiques

### 4.1 Création automatique des feuilles

La création de session passe **toujours** par la command applicative `CreateSessionCommand` (Server Action `scheduling`), qui — dans la même transaction — délègue à `AttendanceSheetService.materializeForSession(session)`. Pas de trigger SQL : la logique vit en TypeScript et reste testable unitairement. L'idempotence est garantie par `UNIQUE (session_id, half_day)` déjà en place.

`attendance_split_strategy` est lu sur le `dossier_module` parent (fallback `auto` si module nul). Stratégies :

- `auto` (défaut) — split à 12h00 dans la TZ de l'organisation (`organizations.timezone`, défaut `Europe/Paris`) : sessions traversant 12h00 ⇒ matin + après-midi. Sinon 1 sheet (`morning` si `ends_at ≤ 13h`, `afternoon` si `starts_at ≥ 12h`, `evening` si `starts_at ≥ 18h`, sinon `full`). Sessions multi-jours : récursion par jour calendaire local.
- `per_day` — 1 sheet par jour, `half_day = full` (BPF déclaré en journées)
- `manual` — aucune création auto, le formateur déclare les sheets explicitement via UI

Les `Signature` rows sont pré-créées en `status = null` pour chaque participant inscrit (lookup `app.session_participants`). À l'`UPDATE` d'une session (changement horaire ou réaffectation participants), `materializeForSession` est ré-appelée et **diff** les sheets/signatures existantes (refuse si une sheet est déjà `finalized`).

### 4.2 QR présentiel (Flow A)

```
Formateur (/emarger/[sheet_id])
  liste apprenants live (Realtime channel attendance:<sheet_id>)
  clic apprenant → modal QR plein écran
    Server Action  generateSignerTokenAction({sheetId, learnerId})
      JWT HS256 { sheet_id, learner_id, jti=uuidv7(), iat, exp: now+30min }
      INSERT app.attendance_token_jtis (jti, status='issued', expires_at)
      return signedUrl

Apprenant (page publique /signer/[token])
  RSC vérifie JWT (signature + exp) → app.get_signature_context()
  Step 1 preview : "Vous êtes Alice. Séance 15/09 matin."
  Step 2 sign : canvas tactile + checkbox "Je confirme ma présence"
  Step 3 submit  Server Action  recordSignatureAction({token, signatureBase64})
    1. Vérif JWT + jti not consumed
    2. headers() → cf-connecting-ip, user-agent, cf-ipcountry
    3. SHA-256(PNG)
    4. Upload PNG bucket `signatures` (service_role)
    5. Transaction atomique :
       UPDATE attendance_signatures SET status='present', signed_at=now(),
              signer_ip, signer_user_agent, signer_country,
              signature_hash, signature_image_path,
              token_jti, evidence_source='qr'
         WHERE sheet_id=$1 AND learner_id=$2 AND signed_at IS NULL
       UPDATE attendance_token_jtis SET status='consumed', consumed_at=now(), consumed_ip=$
       INSERT infra.domain_events (kind='SignatureRecorded', ...)
    6. Realtime broadcast attendance:<sheet_id>
  Step 4 done : "Signé. Hash a1b2…"
```

### 4.3 Distanciel CSV Zoom (Flow B)

```
Formateur (/emarger/[sheet_id] → onglet "Import Zoom")
  drop participants_xxx.csv
  Server Action  importZoomCsvAction({sheetId, csvFile})
    1. Parser tolérant (colonnes auto-détectées : Name, Email, Join, Leave, Duration)
       Compatible Zoom natif + Teams/Meet/Webex via signature first-row
    2. Pour chaque ligne : matching email → app.learners via session_participants
       Si pas matché → INSERT zoom_import_unmatched
    3. Calcul présence : total_duration_minutes ≥ 0.75 × session.duration_minutes
       ⇒ 'present', sinon 'late' (durée connue, juste insuffisante)
    4. UPDATE attendance_signatures
       status, signed_at=join_time, signer_ip='zoom://<meeting_id>',
       signature_hash=sha256(raw_csv_line), evidence_source='zoom_csv',
       evidence_payload={join, leave, duration, raw_line}
    5. Stocke csv brut dans bucket `zoom_imports/<sheet_id>.csv`
    6. emit ZoomAttendanceImported

UI unmatched
  liste avec dropdown "Lier à apprenant" → resolveUnmatchedAction → re-run mapping
```

### 4.4 Distanciel API Zoom S2S (Flow C)

```
Setup tenant (admin OF, /reglages/integrations/zoom)
  form Account ID + Client ID + Client Secret
  Server Action  connectZoomS2sAction
    1. Encrypt via pgsodium (clé symmétrique projet)
    2. Test : OAuth client_credentials → GET /v2/users/me
    3. UPSERT app.tenant_integrations (organization_id, kind='zoom_s2s', config_encrypted)

Synchronisation (pg_cron hourly)
  SELECT sessions WHERE ends_at < now() - interval '30 min'
    AND modality='distanciel' AND zoom_meeting_id IS NOT NULL
    AND id NOT IN (SELECT session_id FROM zoom_sync_logs WHERE status='success')
  → Edge Function zoom-sync(tenant_id, session_id)
    1. Decrypt secrets via pgsodium
    2. OAuth (cache token 1h)
    3. GET /v2/past_meetings/{meeting_id}/participants?page_size=300 (paginé)
    4. Pipeline identique Flow B (matching + 75% threshold + UPDATE)
    5. INSERT zoom_sync_logs(meeting_id, fetched_at, participants_count, matched, unmatched, status)
    6. Idempotent : ON CONFLICT (sheet_id, learner_id) DO NOTHING si signed_at déjà set
```

### 4.5 Finalisation (Flow D)

```
Formateur → bouton "Finaliser" actif quand toutes signatures status ≠ null
  Server Action  finalizeSheetAction({sheetId})
    1. AttendanceSheet.finalize() : Result<> — vérifie invariants 4 & 5
    2. Render PDF via @react-pdf/renderer
       Header : logo OF + dossier ref + formation + half-day
       Table : apprenant × signature inline (PNG signed URL OU "Zoom log {meeting_id}")
       Footer : signature formateur, hash sheet, "Document généré le ... — i-a-infinity"
    3. SHA-256(PDF)
    4. Upload bucket `documents/<dossier_id>/emargements/<sheet_id>.pdf`
    5. INSERT app.documents (kind='feuille_emargement_signee', dossier_id, sheet_id, hash, path)
    6. UPDATE attendance_sheets SET status='finalized', finalized_at=now(), finalized_by=auth.uid(), document_id
    7. Trigger SQL d'immutabilité actif à partir d'ici
    8. emit AttendanceSheetFinalized
```

## 5. Modèle de données

### 5.1 Migrations ajoutées

| # | Fichier | Contenu |
|---|---|---|
| 0027 | `attendance_tokens.sql` | Table `app.attendance_token_jtis` (anti-replay) |
| 0028 | `attendance_split_strategy.sql` | `ALTER dossier_modules ADD attendance_split_strategy` + alter `attendance_signatures` (`signer_country`, `evidence_source`, `evidence_payload`) |
| 0029 | `zoom_integration.sql` | Tables `tenant_integrations`, `zoom_sync_logs`, `zoom_import_unmatched` |
| 0030 | `attendance_immutability.sql` | Trigger BEFORE UPDATE/DELETE sur `attendance_sheets` et `attendance_signatures` rejetant si `status='finalized'` (sauf set initial `document_id`) |

### 5.2 RLS (extension migration 0021)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `attendance_sheets` | membres org | role admin/manager + trainer assigné | idem (sauf finalized via trigger) | deny all |
| `attendance_signatures` | membres org | service_role + trainer override | idem | deny all |
| `attendance_token_jtis` | service_role only | service_role only | service_role only | service_role only |
| `tenant_integrations` | role admin (own org) | role admin | role admin | role admin |
| `zoom_sync_logs` | membres org (R) | service_role | — | — |
| `zoom_import_unmatched` | membres org | service_role | role formateur/admin (resolve) | service_role |

### 5.3 Tests pgTAP (`supabase/tests/`)

- `attendance_rls_member_isolation.sql` — membre OF A ne voit pas signatures OF B
- `attendance_rls_anon_blocked.sql` — `anon` ne lit rien sur `attendance_*`
- `attendance_immutability.sql` — UPDATE/DELETE sur sheet finalized ⇒ exception
- `token_jti_lifecycle.sql` — jti `consumed` ne peut être ré-utilisé
- `zoom_integration_admin_only.sql` — seul role admin lit/écrit `tenant_integrations`

## 6. Sécurité

- **JWT** : HS256, `TOKEN_SIGNING_KEY` ≥ 256 bits, rotation documentée dans `docs/runbooks/`
- **TTL** : 30 min QR live, 24 h emails J-1 (V2 hors scope), 7 j formateur override
- **Anti-replay** : `jti` UUIDv7 consommé en transaction atomique (409 si rejoué)
- **Capture serveur** (jamais client) :
  - IP via `cf-connecting-ip` ou `x-forwarded-for[0]` (liste trusted-proxy en config Next)
  - UA via `user-agent`
  - Country via `cf-ipcountry` (gratuit Cloudflare/Railway)
- **Service role** : uniquement Edge Function `record-signature` (vérif JWT puis insert) ; jamais dans Server Components/Actions utilisateur authentifié
- **Bucket `signatures`** : privé, lecture via signed URL TTL 5 min pour intégration dans PDF
- **Bucket `zoom_imports`** : privé, lecture admin org only
- **Pgsodium** : secrets Zoom S2S chiffrés au repos, déchiffrement uniquement dans Edge Function `zoom-sync`
- **Rétention IP** : 5 ans (durée archivage Qualiopi) puis purge automatique par `pg_cron` job nightly

## 7. UI

### 7.1 Surfaces

| Route | Archetype | État | Action |
|---|---|---|---|
| `/(dashboard)/emargements` | command | mock | Câbler liste filtrable (statut/dossier/date) + badges |
| `/(dashboard)/dossiers/[id]/emargements` | command | vide | Créer : liste sheets du dossier + download PDF si finalized |
| `/(formateur)/emarger/[sheet_id]` | command | mock | Câbler : header session, liste apprenants live (Realtime), onglets `QR` / `Import Zoom` / `Override`, bouton "Finaliser" |
| `/(apprenant)/signer/[token]` | workflow | mock | Câbler : preview RSC → canvas → submit → done |
| `/(dashboard)/reglages/integrations/zoom` | command | à créer | Form connexion S2S, test, statut dernier sync |

### 7.2 Realtime

Channel `attendance:<sheet_id>` sur Supabase Realtime (subscription `app.attendance_signatures` filtrée par `attendance_sheet_id`). Écran formateur s'actualise sans refresh dès qu'une `Signature` est INSERTée ou UPDATEée.

### 7.3 Server Actions (next-safe-action + Zod, `features/attendance/ui/actions/`)

```
generateSignerTokenAction({sheetId, learnerId})        → {url, expiresAt}
recordSignatureAction({token, signatureBase64})        → {hash} | Result<E>
overrideAttendanceAction({signatureId, status, notes}) → Result<>
importZoomCsvAction({sheetId, csvFile})                → {matched, unmatched}
resolveUnmatchedAction({id, learnerId})                → Result<>
finalizeSheetAction({sheetId})                         → {documentId, hash}
connectZoomS2sAction({accountId, clientId, secret})    → {ok, userInfo}
testZoomConnectionAction()                             → {ok}
```

Toutes wrappées via `authActionClient`, sauf `recordSignatureAction` via `tokenActionClient` (JWT au lieu de session Supabase).

## 8. Tests

```
features/attendance/domain/__tests__/
  attendance-sheet.test.ts   invariants finalize, immutability, split coverage
  signature.test.ts          replay detection, hash determinism
  split-strategy.test.ts     auto vs per_day vs manual

features/attendance/application/__tests__/
  generate-token.test.ts          TTL, JTI uniqueness
  record-signature.test.ts        token verify, IP capture, atomic write
  import-zoom-csv.test.ts         parser tolérant, matching, threshold 75%
  finalize-sheet.test.ts          invariants, PDF render, document creation

apps/web/tests/e2e/
  attendance-presentiel.spec.ts   flow QR scan → sign → realtime update → finalize
  attendance-zoom-csv.spec.ts     upload CSV → unmatched resolution → finalize
  attendance-immutable.spec.ts    edit finalized sheet → 403

supabase/tests/   (5 pgTAP listés en 5.3)
```

## 9. Plan d'exécution

```
J1   Migrations 0027-0030 + tests pgTAP RLS
J2   Domain layer features/attendance/domain/ + tests Vitest
J3   Application : commands/queries + ports + tests
J4   Infrastructure : Supabase repository + JWT signer + IP resolver + PDF renderer
J5   Server Actions + câblage routes formateur + apprenant (QR + signature)
J6   CSV Zoom parser + import flow + UI unmatched + Realtime
J7   Edge Function zoom-sync + pg_cron + UI réglages tenant
J8   Finalisation + PDF + document + immutabilité + E2E happy paths
J9   Tests E2E edge cases + a11y + dark mode + audit RGPD (IP retention)
J10  Recette + ajustements + doc opérationnelle (docs/runbooks/)
```

~10 jours focus, ~2 semaines calendaires.

## 10. Out of scope (V2 / V3)

- Emails J-1 avec lien magique (dépend transactional email)
- Photo selfie + ID check pour dossiers CPF haut risque (>1500€)
- Fingerprint device côté client (canvas/audio hash)
- API Teams/Meet/Webex (V1 = CSV générique, API = Zoom uniquement)
- Signature électronique avancée (eIDAS Substantial/High) — Qualiopi ne l'exige pas
- Géoloc IP fine (city) — actuellement country only via `cf-ipcountry`

## 11. Risques & mitigations

| Risque | Mitigation |
|---|---|
| Trusted-proxy mal configuré côté Railway/Next → IP spoofable | Whitelist explicite des IPs reverse-proxy dans `next.config.mjs`, doc runbook |
| pgsodium pas activé sur instance Supabase | Vérifié dès J7, fallback `pgcrypto` documenté |
| Format CSV Zoom évolue | Parser tolérant aux colonnes (détection first-row), tests sur 4 fichiers réels Zoom/Teams/Meet/Webex |
| @react-pdf/renderer lent en cold start Railway | Bench J8, fallback Edge Function dédiée si > 2s |
| Conflit avec migration 0026 (token JWT existant) | 0027 ajoute table `attendance_token_jtis` sans toucher `attendance_signatures.token_id` (compat) |
| Sessions de plusieurs jours (multi-day) | `auto` crée N×2 sheets, testé J2 |

## 12. Définition de "done"

- 10 invariants domain testés ≥ 95% coverage
- 5 tests pgTAP passent
- 3 tests E2E passent (présentiel, zoom CSV, immutable)
- Charte UI v3 respectée (audité visuel J9)
- Mode sombre fonctionnel sur les 5 routes
- Runbook `docs/runbooks/attendance.md` : rotation JWT, purge IP 5 ans, setup Zoom S2S par tenant
- 0 erreur `tsc --noEmit` + `pnpm test` + `pnpm test:e2e` verts en CI
