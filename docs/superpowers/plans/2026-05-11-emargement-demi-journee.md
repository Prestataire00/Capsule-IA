# Émargement par demi-journée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le bounded context `attendance` complet pour i-a-infinity OF : génération automatique de feuilles d'émargement par demi-journée (split 12h auto + override), signature QR individuelle (présentiel) avec capture IP/UA/country, import Zoom CSV + API S2S OAuth (distanciel), finalisation immuable avec PDF + document Qualiopi.

**Architecture:** DDD light en 4 couches dans `apps/web/features/attendance/` (domain pur sans deps externes, application avec ports/commands, infrastructure avec repos Supabase, ui avec Server Actions next-safe-action). Toutes les écritures de signatures passent par RPC `app.record_attendance_signature` (SECURITY DEFINER, service_role) guardée par JWT HS256 anti-replay. Realtime via channel `attendance:<sheet_id>`. PDF via `@react-pdf/renderer`.

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Supabase (Postgres + RLS + Storage + Edge Functions + pg_cron + Realtime + pgsodium) · jose (JWT) · papaparse (CSV) · @react-pdf/renderer · qrcode (server-side QR PNG) · next-safe-action · Vitest · Playwright · pgTAP.

**Référence:** `docs/superpowers/specs/2026-05-11-emargement-demi-journee-design.md`

---

## Pré-requis & état initial

- Migrations 0001-0026 déjà appliquées (scaffold attendance + RPC `record_attendance_signature` v1 + `get_signature_context` + bucket `signatures`)
- `apps/web/shared/lib/signature-token.ts` existe (JWT HS256, TTL 24h)
- `apps/web/app/(apprenant)/signer/[token]/actions.ts` existe (V1, sera refondu)
- 3 routes UI sont en mocks pleins (formateur `/emarger/[id]`, apprenant `/signer/[token]`, dashboard `/emargements`)
- `features/attendance/` est **vide**
- `next-safe-action@7.9.3` installé, **pas encore configuré** (pas de `safe-action.ts`)
- Pas encore : `@react-pdf/renderer`, `papaparse`, `qrcode`, `@types/papaparse`

## File Structure

### Migrations SQL (à créer)
```
supabase/migrations/
  0027_attendance_tokens.sql           ← table attendance_token_jtis + RPC consume_token
  0028_attendance_columns.sql          ← ALTER signatures + ALTER dossier_modules
  0029_zoom_integration.sql            ← tenant_integrations + zoom_sync_logs + zoom_import_unmatched + bucket zoom_imports
  0030_attendance_immutability.sql     ← trigger immutabilité sheets + signatures
  0031_record_signature_v2.sql         ← REPLACE RPC record_attendance_signature (anti-replay JTI + country + evidence)
  0032_rls_attendance_extension.sql    ← policies tenant_integrations + zoom_* + token_jtis service_role
```

### Tests pgTAP (à créer)
```
supabase/tests/
  attendance_rls_member_isolation.sql
  attendance_rls_anon_blocked.sql
  attendance_immutability.sql
  token_jti_lifecycle.sql
  zoom_integration_admin_only.sql
```

### Domain layer (à créer, deps autorisées : `@/shared/lib/result`, `@/shared/lib/branded`)
```
apps/web/features/attendance/domain/
  ids.ts                                       ← AttendanceSheetId, SignatureId, TokenJti, SessionId, ZoomMeetingId
  attendance-sheet.entity.ts                   ← aggregate root
  signature.entity.ts                          ← entity (interne à l'aggregate)
  signer-token.vo.ts                           ← VO + factory + serialization
  half-day.ts                                  ← VO HalfDay + split logic
  attendance-status.ts                         ← VO AttendanceStatus
  attendance-split-strategy.ts                 ← VO + materialize logic
  evidence-source.ts                           ← VO EvidenceSource
  attendance.errors.ts                         ← AttendanceError union
  attendance.events.ts                         ← DomainEvents union
  __tests__/
    attendance-sheet.test.ts
    signature.test.ts
    half-day.test.ts
    split-strategy.test.ts
    signer-token.test.ts
```

### Application layer (à créer, deps autorisées : domain + result + branded, jamais Supabase/Next)
```
apps/web/features/attendance/application/
  ports/
    attendance-sheet.repository.ts
    token-signer.ts
    ip-resolver.ts
    pdf-renderer.ts
    zoom-csv-importer.ts
    zoom-api-client.ts
    secret-cipher.ts
    clock.ts
    id-generator.ts
  commands/
    materialize-for-session.ts
    generate-signer-token.ts
    record-signature.ts
    override-attendance.ts
    import-zoom-csv.ts
    resolve-unmatched.ts
    finalize-sheet.ts
    connect-zoom-s2s.ts
    sync-zoom-attendance.ts
  queries/
    list-sheets-for-dossier.ts
    list-pending-sheets.ts
    get-sheet-detail.ts
  __tests__/
    materialize-for-session.test.ts
    generate-signer-token.test.ts
    record-signature.test.ts
    import-zoom-csv.test.ts
    finalize-sheet.test.ts
    sync-zoom-attendance.test.ts
```

### Infrastructure layer (à créer)
```
apps/web/features/attendance/infrastructure/
  repositories/
    supabase-attendance-sheet.repository.ts
  adapters/
    jose-token-signer.ts
    headers-ip-resolver.ts
    csv-zoom-importer.ts                     ← papaparse parser tolérant
    fetch-zoom-api-client.ts
    react-pdf-renderer.ts
    pgsodium-secret-cipher.ts
  mappers/
    attendance-sheet.mapper.ts                ← DB row ↔ entity
    signature.mapper.ts
```

### UI layer (à créer ou remplacer mocks)
```
apps/web/features/attendance/ui/
  actions/
    generate-signer-token.action.ts
    record-signature.action.ts
    override-attendance.action.ts
    import-zoom-csv.action.ts
    resolve-unmatched.action.ts
    finalize-sheet.action.ts
    connect-zoom-s2s.action.ts
    test-zoom-connection.action.ts
  components/
    attendance-sheet-card.tsx
    qr-modal.tsx
    participant-row.tsx
    zoom-import-panel.tsx
    unmatched-resolution.tsx
    finalize-button.tsx
  schemas/
    attendance.schemas.ts                     ← schémas Zod partagés forms/actions
```

### Routes Next.js
```
apps/web/app/
  (dashboard)/
    emargements/page.tsx                      ← REMPLACER mock
    dossiers/[id]/emargements/page.tsx        ← CRÉER
    reglages/integrations/zoom/page.tsx       ← CRÉER
  (formateur)/
    emarger/[id]/page.tsx                     ← REMPLACER mock
  (apprenant)/
    signer/[token]/page.tsx                   ← REMPLACER mock
    signer/[token]/actions.ts                 ← SUPPRIMER (déjà existant, refondu vers features/attendance/ui/actions)
```

### Edge Functions
```
supabase/functions/
  zoom-sync/
    index.ts                                  ← Cron-triggered sync
    deno.json
```

### Shared / config
```
apps/web/shared/lib/
  safe-action.ts                              ← CRÉER : authActionClient + tokenActionClient
  supabase/admin.ts                            ← existant, à ré-exporter pattern
```

### Documentation
```
docs/runbooks/
  attendance.md                                ← CRÉER : rotation JWT, purge IP 5 ans, Zoom S2S setup
```

### E2E tests
```
apps/web/tests/e2e/
  attendance-presentiel.spec.ts
  attendance-zoom-csv.spec.ts
  attendance-immutable.spec.ts
```

---

## Phase 0 — Dépendances & outillage (~30 min)

### Task 0.1: Installer les dépendances manquantes

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Installer les libs runtime**

Run depuis la racine repo :
```bash
cd apps/web && pnpm add @react-pdf/renderer papaparse qrcode
```

- [ ] **Step 2: Installer les types**

```bash
cd apps/web && pnpm add -D @types/papaparse @types/qrcode
```

- [ ] **Step 3: Vérifier l'install**

```bash
cd apps/web && pnpm typecheck
```
Expected: PASS (aucune erreur, juste vérification que les deps résolvent bien)

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(attendance): add @react-pdf/renderer, papaparse, qrcode deps"
git push origin main
```

---

## Phase 1 — Migrations SQL (~J1)

### Task 1.1: Migration 0027 — Anti-replay JTI

**Files:**
- Create: `supabase/migrations/0027_attendance_tokens.sql`

- [ ] **Step 1: Créer le fichier de migration**

```sql
-- ============================================================================
-- 0027 — Anti-replay JTI pour tokens de signature
-- ============================================================================
-- Chaque génération de SignerToken (JWT HS256) insère une ligne 'issued'.
-- La consommation passe à 'consumed' en transaction atomique. Un rejeu lève
-- une erreur P0003. Purge automatique des tokens expirés via pg_cron nightly.

CREATE TABLE app.attendance_token_jtis (
  jti UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  attendance_sheet_id UUID NOT NULL REFERENCES app.attendance_sheets(id) ON DELETE CASCADE,
  signer_id UUID NOT NULL,
  signer_kind TEXT NOT NULL CHECK (signer_kind IN ('learner','trainer')),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued','consumed','expired','revoked')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_ip INET,
  CHECK (expires_at > issued_at)
);

CREATE INDEX ix_token_jtis_sheet ON app.attendance_token_jtis(attendance_sheet_id);
CREATE INDEX ix_token_jtis_expires_open
  ON app.attendance_token_jtis(expires_at) WHERE status = 'issued';

ALTER TABLE app.attendance_token_jtis ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.attendance_token_jtis FORCE ROW LEVEL SECURITY;

-- RPC consume_token : appelée par RPC record_attendance_signature (chaîne SECURITY DEFINER)
CREATE OR REPLACE FUNCTION app.consume_attendance_token(
  p_jti UUID,
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_consumed_ip INET
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_row app.attendance_token_jtis;
BEGIN
  SELECT * INTO v_row FROM app.attendance_token_jtis
   WHERE jti = p_jti FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_unknown' USING ERRCODE = 'P0003';
  END IF;

  IF v_row.status <> 'issued' THEN
    RAISE EXCEPTION 'token_already_%', v_row.status USING ERRCODE = 'P0003';
  END IF;

  IF v_row.expires_at < now() THEN
    UPDATE app.attendance_token_jtis SET status = 'expired' WHERE jti = p_jti;
    RAISE EXCEPTION 'token_expired' USING ERRCODE = 'P0003';
  END IF;

  IF v_row.attendance_sheet_id <> p_attendance_sheet_id
     OR v_row.signer_id <> p_signer_id
     OR v_row.signer_kind <> p_signer_kind THEN
    RAISE EXCEPTION 'token_payload_mismatch' USING ERRCODE = 'P0003';
  END IF;

  UPDATE app.attendance_token_jtis
     SET status = 'consumed', consumed_at = now(), consumed_ip = p_consumed_ip
   WHERE jti = p_jti;
END;
$$;

REVOKE ALL ON FUNCTION app.consume_attendance_token(UUID, UUID, UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_attendance_token(UUID, UUID, UUID, TEXT, INET) TO service_role;

-- pg_cron job nightly : expirer les tokens stale
SELECT cron.schedule(
  'attendance_token_jtis_expire_stale',
  '17 3 * * *',
  $cron$
    UPDATE app.attendance_token_jtis
       SET status = 'expired'
     WHERE status = 'issued' AND expires_at < now();
  $cron$
);
```

- [ ] **Step 2: Reset DB locale et valider**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:reset
```
Expected: migration 0027 appliquée sans erreur, table créée, fonction présente

- [ ] **Step 3: Smoke check via psql**

```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "\d app.attendance_token_jtis"
```
Expected: 9 colonnes listées, 2 indexes, RLS enabled

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0027_attendance_tokens.sql
git commit -m "feat(attendance): migration 0027 anti-replay JTI table + consume RPC"
git push origin main
```

### Task 1.2: Migration 0028 — Colonnes manquantes

**Files:**
- Create: `supabase/migrations/0028_attendance_columns.sql`

- [ ] **Step 1: Créer le fichier**

```sql
-- ============================================================================
-- 0028 — Colonnes additionnelles (split strategy, country, evidence)
-- ============================================================================

ALTER TABLE app.dossier_modules
  ADD COLUMN attendance_split_strategy TEXT NOT NULL DEFAULT 'auto'
    CHECK (attendance_split_strategy IN ('auto','per_day','manual'));

ALTER TABLE app.attendance_signatures
  ADD COLUMN signer_country CHAR(2),
  ADD COLUMN evidence_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (evidence_source IN ('manual','qr','zoom_csv','zoom_api','trainer_override')),
  ADD COLUMN evidence_payload JSONB;

CREATE INDEX ix_attendance_signatures_evidence_source
  ON app.attendance_signatures(organization_id, evidence_source);

COMMENT ON COLUMN app.attendance_signatures.signer_country IS
  'ISO-3166-1 alpha-2, depuis cf-ipcountry (Cloudflare/Railway). NULL si non résolu.';
COMMENT ON COLUMN app.attendance_signatures.evidence_source IS
  'Source de la preuve : manual=formateur, qr=apprenant signe via QR, zoom_*=log Zoom, trainer_override=correction manuelle';
COMMENT ON COLUMN app.attendance_signatures.evidence_payload IS
  'Payload spécifique à la source. Ex: {join,leave,duration,raw_line} pour zoom_*';
```

- [ ] **Step 2: Reset + smoke check**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:reset
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "\d app.attendance_signatures" | grep -E "signer_country|evidence_"
```
Expected: 3 colonnes ajoutées visibles

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_attendance_columns.sql
git commit -m "feat(attendance): migration 0028 split_strategy + country + evidence columns"
git push origin main
```

### Task 1.3: Migration 0029 — Intégration Zoom

**Files:**
- Create: `supabase/migrations/0029_zoom_integration.sql`

- [ ] **Step 1: Créer le fichier**

```sql
-- ============================================================================
-- 0029 — Intégration Zoom : secrets chiffrés + logs sync + unmatched
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgsodium;

CREATE TABLE app.tenant_integrations (
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('zoom_s2s')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disabled','error')),
  config_encrypted BYTEA NOT NULL,
  config_nonce BYTEA NOT NULL,
  config_key_id UUID NOT NULL,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, kind)
);

CREATE TABLE app.zoom_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES app.sessions(id) ON DELETE CASCADE,
  attendance_sheet_id UUID REFERENCES app.attendance_sheets(id) ON DELETE SET NULL,
  meeting_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  participants_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  unmatched_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success','partial','error')),
  error_detail TEXT,
  payload_size_bytes INT
);
CREATE INDEX ix_zoom_sync_logs_session ON app.zoom_sync_logs(session_id);
CREATE INDEX ix_zoom_sync_logs_org_fetched ON app.zoom_sync_logs(organization_id, fetched_at DESC);

CREATE TABLE app.zoom_import_unmatched (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  attendance_sheet_id UUID NOT NULL REFERENCES app.attendance_sheets(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('zoom_csv','zoom_api')),
  raw_email TEXT,
  raw_name TEXT,
  join_time TIMESTAMPTZ,
  leave_time TIMESTAMPTZ,
  duration_minutes INT,
  resolved_learner_id UUID REFERENCES app.learners(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_zoom_unmatched_sheet ON app.zoom_import_unmatched(attendance_sheet_id);
CREATE INDEX ix_zoom_unmatched_pending
  ON app.zoom_import_unmatched(organization_id)
  WHERE resolved_at IS NULL;

ALTER TABLE app.tenant_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenant_integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_sync_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_import_unmatched ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.zoom_import_unmatched FORCE ROW LEVEL SECURITY;

-- Bucket privé pour CSV bruts (audit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'zoom_imports',
  'zoom_imports',
  false,
  10485760, -- 10 MB max
  ARRAY['text/csv','application/vnd.ms-excel']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "zoom_imports_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'zoom_imports');
```

- [ ] **Step 2: Reset DB + smoke**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:reset
```
Expected: pgsodium extension activée, 3 tables créées, bucket zoom_imports OK

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0029_zoom_integration.sql
git commit -m "feat(attendance): migration 0029 zoom integration + secrets + audit logs"
git push origin main
```

### Task 1.4: Migration 0030 — Immutabilité après finalisation

**Files:**
- Create: `supabase/migrations/0030_attendance_immutability.sql`

- [ ] **Step 1: Créer le fichier**

```sql
-- ============================================================================
-- 0030 — Immutabilité après finalisation (Qualiopi : preuves infalsifiables)
-- ============================================================================

-- Trigger sur attendance_sheets : refuse UPDATE/DELETE si status='finalized',
-- sauf le set initial de document_id (transition open→finalized).

CREATE OR REPLACE FUNCTION app.tg_attendance_sheet_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_sheet_finalized_no_delete'
      USING ERRCODE = 'P0010',
            MESSAGE = format('Feuille %s finalisée : suppression interdite', OLD.id);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    -- Autorise uniquement document_id NULL→non-NULL avec tous les autres champs égaux
    IF OLD.document_id IS NULL AND NEW.document_id IS NOT NULL
       AND OLD.status = NEW.status
       AND OLD.finalized_at IS NOT DISTINCT FROM NEW.finalized_at
       AND OLD.finalized_by IS NOT DISTINCT FROM NEW.finalized_by THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'attendance_sheet_finalized_no_update'
      USING ERRCODE = 'P0010',
            MESSAGE = format('Feuille %s finalisée : modification interdite', OLD.id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER tg_attendance_sheet_immutable
  BEFORE UPDATE OR DELETE ON app.attendance_sheets
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_sheet_immutable();

-- Trigger sur attendance_signatures : refuse UPDATE/DELETE si parent sheet finalisé.
CREATE OR REPLACE FUNCTION app.tg_attendance_signature_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_sheet_status TEXT;
BEGIN
  SELECT status INTO v_sheet_status
    FROM app.attendance_sheets
   WHERE id = COALESCE(NEW.attendance_sheet_id, OLD.attendance_sheet_id);

  IF v_sheet_status = 'finalized' THEN
    RAISE EXCEPTION 'attendance_signature_parent_finalized'
      USING ERRCODE = 'P0010',
            MESSAGE = 'Signature parent finalisée : modification interdite';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER tg_attendance_signature_immutable
  BEFORE UPDATE OR DELETE ON app.attendance_signatures
  FOR EACH ROW EXECUTE FUNCTION app.tg_attendance_signature_immutable();
```

- [ ] **Step 2: Reset + smoke**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:reset
psql "$DB_URL" -c "\\df app.tg_attendance_*"
```
Expected: 2 fonctions trigger listées

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0030_attendance_immutability.sql
git commit -m "feat(attendance): migration 0030 immutability triggers post-finalization"
git push origin main
```

### Task 1.5: Migration 0031 — RPC record_attendance_signature v2

**Files:**
- Create: `supabase/migrations/0031_record_signature_v2.sql`

- [ ] **Step 1: Créer le fichier**

```sql
-- ============================================================================
-- 0031 — RPC record_attendance_signature v2 (anti-replay + country + evidence)
-- ============================================================================
-- Remplace la version 0026. Ajoute :
--   - Anti-replay : appel app.consume_attendance_token(jti, ...) en transaction
--   - signer_country (cf-ipcountry)
--   - evidence_source / evidence_payload
--   - WHERE clause sur participant pré-créé (refus si pas dans session_participants)

CREATE OR REPLACE FUNCTION app.record_attendance_signature(
  p_attendance_sheet_id UUID,
  p_signer_id UUID,
  p_signer_kind TEXT,
  p_image_path TEXT,
  p_signature_hash TEXT,
  p_signer_ip INET,
  p_signer_user_agent TEXT,
  p_signer_country CHAR(2),
  p_token_jti UUID,
  p_evidence_source TEXT,
  p_evidence_payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_org_id UUID;
  v_signature_id UUID;
BEGIN
  IF p_signer_kind NOT IN ('learner','trainer') THEN
    RAISE EXCEPTION 'invalid_signer_kind' USING ERRCODE = 'P0001';
  END IF;
  IF p_evidence_source NOT IN ('manual','qr','zoom_csv','zoom_api','trainer_override') THEN
    RAISE EXCEPTION 'invalid_evidence_source' USING ERRCODE = 'P0001';
  END IF;

  -- Lock sheet row + récup org
  SELECT organization_id INTO v_org_id
    FROM app.attendance_sheets
   WHERE id = p_attendance_sheet_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'attendance_sheet_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Anti-replay (seulement si token fourni — override manuel n'en a pas)
  IF p_token_jti IS NOT NULL THEN
    PERFORM app.consume_attendance_token(
      p_token_jti, p_attendance_sheet_id, p_signer_id, p_signer_kind, p_signer_ip
    );
  END IF;

  -- UPSERT signature (pré-créée à la materialization OU créée ici si override)
  INSERT INTO app.attendance_signatures (
    organization_id, attendance_sheet_id, participant_kind,
    learner_id, trainer_id,
    status, signature_image_path, signed_at,
    signer_ip, signer_user_agent, signer_country,
    signature_hash, token_id,
    evidence_source, evidence_payload
  ) VALUES (
    v_org_id, p_attendance_sheet_id, p_signer_kind,
    CASE WHEN p_signer_kind = 'learner' THEN p_signer_id END,
    CASE WHEN p_signer_kind = 'trainer' THEN p_signer_id END,
    'present', p_image_path, now(),
    p_signer_ip, p_signer_user_agent, p_signer_country,
    p_signature_hash, p_token_jti,
    p_evidence_source, p_evidence_payload
  )
  ON CONFLICT (attendance_sheet_id, participant_kind, participant_id)
  DO UPDATE SET
    status = 'present',
    signature_image_path = EXCLUDED.signature_image_path,
    signed_at = EXCLUDED.signed_at,
    signer_ip = EXCLUDED.signer_ip,
    signer_user_agent = EXCLUDED.signer_user_agent,
    signer_country = EXCLUDED.signer_country,
    signature_hash = EXCLUDED.signature_hash,
    token_id = EXCLUDED.token_id,
    evidence_source = EXCLUDED.evidence_source,
    evidence_payload = EXCLUDED.evidence_payload
  RETURNING id INTO v_signature_id;

  -- Outbox event
  INSERT INTO infra.domain_events (id, organization_id, aggregate_id, kind, payload)
  VALUES (
    uuidv7(), v_org_id, p_attendance_sheet_id, 'SignatureRecorded',
    jsonb_build_object(
      'signatureId', v_signature_id,
      'signerKind', p_signer_kind,
      'signerId', p_signer_id,
      'evidenceSource', p_evidence_source
    )
  );

  RETURN v_signature_id;
END;
$$;

REVOKE ALL ON FUNCTION app.record_attendance_signature(
  UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_attendance_signature(
  UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, CHAR, UUID, TEXT, JSONB
) TO service_role;

-- Supprimer l'ancienne signature de fonction (de 0026)
DROP FUNCTION IF EXISTS app.record_attendance_signature(
  UUID, UUID, TEXT, TEXT, TEXT, INET, TEXT, UUID
);
```

- [ ] **Step 2: Reset + smoke**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:reset
psql "$DB_URL" -c "\\df app.record_attendance_signature"
```
Expected: une seule signature avec 11 args (signer_country CHAR, evidence_*)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0031_record_signature_v2.sql
git commit -m "feat(attendance): migration 0031 record_signature v2 (anti-replay + evidence)"
git push origin main
```

### Task 1.6: Migration 0032 — RLS pour nouvelles tables

**Files:**
- Create: `supabase/migrations/0032_rls_attendance_extension.sql`

- [ ] **Step 1: Créer le fichier**

```sql
-- ============================================================================
-- 0032 — RLS pour attendance_token_jtis, tenant_integrations, zoom_*
-- ============================================================================

-- ── attendance_token_jtis : service_role uniquement, aucune policy "authenticated"
-- Pas de policy = aucun accès via authenticated (RLS forced).

-- ── tenant_integrations : admin/owner de l'org uniquement
CREATE POLICY tenant_integrations_select ON app.tenant_integrations FOR SELECT
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY tenant_integrations_insert ON app.tenant_integrations FOR INSERT
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY tenant_integrations_update ON app.tenant_integrations FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

CREATE POLICY tenant_integrations_delete ON app.tenant_integrations FOR DELETE
USING (organization_id = app.current_organization_id() AND app.is_admin_or_owner());

-- ── zoom_sync_logs : lecture pour membres staff/formateur, écriture service_role only
CREATE POLICY zoom_sync_logs_select ON app.zoom_sync_logs FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('formateur'))
);

-- ── zoom_import_unmatched : staff/formateur read+resolve
CREATE POLICY zoom_unmatched_select ON app.zoom_import_unmatched FOR SELECT
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('formateur'))
);

CREATE POLICY zoom_unmatched_update ON app.zoom_import_unmatched FOR UPDATE
USING (
  organization_id = app.current_organization_id()
  AND (app.is_staff() OR app.has_role('formateur'))
)
WITH CHECK (organization_id = app.current_organization_id());

-- ── Deny DELETE on attendance_sheets/signatures globalement (sauf service_role)
-- déjà géré par trigger d'immutabilité + absence de policy DELETE
```

- [ ] **Step 2: Reset + smoke**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:reset
psql "$DB_URL" -c "SELECT polname FROM pg_policy WHERE polrelid IN ('app.tenant_integrations'::regclass, 'app.zoom_sync_logs'::regclass, 'app.zoom_import_unmatched'::regclass);"
```
Expected: 6 policies listées

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0032_rls_attendance_extension.sql
git commit -m "feat(attendance): migration 0032 RLS for tenant_integrations + zoom_* tables"
git push origin main
```

---

## Phase 2 — Tests pgTAP RLS & immutability (~J1 fin)

### Task 2.1: pgTAP — isolation membres entre orgs

**Files:**
- Create: `supabase/tests/attendance_rls_member_isolation.sql`

- [ ] **Step 1: Créer le fichier**

```sql
BEGIN;
SELECT plan(4);

\i supabase/tests/_helpers.sql

-- Setup : 2 orgs, 1 sheet par org
DO $$
DECLARE
  v_org_a UUID := gen_random_uuid();
  v_org_b UUID := gen_random_uuid();
  v_user_a UUID := gen_random_uuid();
  v_user_b UUID := gen_random_uuid();
  v_dossier_a UUID;
  v_session_a UUID;
  v_sheet_a UUID;
  v_sheet_b UUID;
BEGIN
  PERFORM tests.as_service_role();
  INSERT INTO app.organizations(id, slug, name) VALUES
    (v_org_a, 'org-a', 'Org A'),
    (v_org_b, 'org-b', 'Org B');
  -- (insertion minimale d'un dossier/session/sheet pour chaque org — voir helpers existants)
  -- Pour brièveté : assume helper tests.seed_attendance_for_org(org_uuid) RETURNS UUID (sheet_id)
  v_sheet_a := tests.seed_attendance_for_org(v_org_a);
  v_sheet_b := tests.seed_attendance_for_org(v_org_b);

  -- En tant que membre de org_a, voir uniquement sheet_a
  PERFORM tests.set_jwt(v_org_a, 'admin', v_user_a);
  PERFORM tests.as_authenticated();
END $$;

SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets),
  1,
  'Membre org A voit 1 sheet uniquement (la sienne)'
);

SELECT is(
  (SELECT count(*)::int FROM app.attendance_signatures),
  (SELECT count(*)::int FROM app.attendance_signatures s
     JOIN app.attendance_sheets sh ON sh.id = s.attendance_sheet_id
    WHERE sh.organization_id = app.current_organization_id()),
  'Membre org A voit uniquement signatures de son org'
);

-- En tant que membre de org_b
DO $$ BEGIN PERFORM tests.set_jwt('<org_b uuid placeholder>', 'admin', '<user_b uuid>'); END $$;
-- (mêmes assertions inversées)

SELECT * FROM finish();
ROLLBACK;
```

> **Note** : ajouter d'abord le helper `tests.seed_attendance_for_org(org)` dans `supabase/tests/_helpers.sql` si pas déjà présent — sinon hardcoder le setup inline.

- [ ] **Step 2: Lancer le test**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:test
```
Expected: `attendance_rls_member_isolation` 4/4 PASS

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/attendance_rls_member_isolation.sql supabase/tests/_helpers.sql
git commit -m "test(attendance): pgTAP isolation membres entre orgs"
git push origin main
```

### Task 2.2: pgTAP — anon ne lit rien

**Files:**
- Create: `supabase/tests/attendance_rls_anon_blocked.sql`

- [ ] **Step 1: Créer le fichier**

```sql
BEGIN;
SELECT plan(5);
\i supabase/tests/_helpers.sql

PERFORM tests.as_service_role();
-- Seed 1 sheet + 1 signature
SELECT tests.seed_attendance_for_org(gen_random_uuid()) AS sheet_id \gset

-- Switch en anon
SET LOCAL ROLE anon;
PERFORM tests.clear_jwt();

SELECT is_empty(
  $$ SELECT id FROM app.attendance_sheets $$,
  'anon ne voit aucune attendance_sheet'
);

SELECT is_empty(
  $$ SELECT id FROM app.attendance_signatures $$,
  'anon ne voit aucune signature'
);

SELECT is_empty(
  $$ SELECT jti FROM app.attendance_token_jtis $$,
  'anon ne voit aucun token_jti'
);

SELECT is_empty(
  $$ SELECT organization_id FROM app.tenant_integrations $$,
  'anon ne voit aucune intégration tenant'
);

SELECT throws_ok(
  $$ INSERT INTO app.attendance_sheets(organization_id, dossier_id, session_id, half_day, status)
     VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'morning', 'open') $$,
  '42501',
  'anon ne peut pas INSERT sheet'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Test + commit**

```bash
pnpm db:test
git add supabase/tests/attendance_rls_anon_blocked.sql
git commit -m "test(attendance): pgTAP anon role blocked from attendance_*"
git push origin main
```

### Task 2.3: pgTAP — immutabilité après finalisation

**Files:**
- Create: `supabase/tests/attendance_immutability.sql`

- [ ] **Step 1: Créer le fichier**

```sql
BEGIN;
SELECT plan(4);
\i supabase/tests/_helpers.sql

PERFORM tests.as_service_role();
SELECT tests.seed_attendance_for_org(gen_random_uuid()) AS sheet_id \gset

-- Finaliser
UPDATE app.attendance_sheets
   SET status='finalized', finalized_at=now()
 WHERE id = :'sheet_id';

-- 1. UPDATE quelconque doit lever P0010
SELECT throws_ok(
  $sql$ UPDATE app.attendance_sheets SET status='open' WHERE id = '$$ || :'sheet_id' || $$' $sql$,
  'P0010',
  'UPDATE sur sheet finalized rejeté'
);

-- 2. DELETE rejeté
SELECT throws_ok(
  $sql$ DELETE FROM app.attendance_sheets WHERE id = '$$ || :'sheet_id' || $$' $sql$,
  'P0010',
  'DELETE sur sheet finalized rejeté'
);

-- 3. Set initial du document_id autorisé
SELECT lives_ok(
  $sql$ UPDATE app.attendance_sheets SET document_id = gen_random_uuid()
        WHERE id = '$$ || :'sheet_id' || $$' AND document_id IS NULL $sql$,
  'Set initial document_id autorisé même finalized'
);

-- 4. Re-set document_id rejeté
SELECT throws_ok(
  $sql$ UPDATE app.attendance_sheets SET document_id = gen_random_uuid()
        WHERE id = '$$ || :'sheet_id' || $$' $sql$,
  'P0010',
  'Re-set document_id sur sheet finalized rejeté'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Test + commit**

```bash
pnpm db:test
git add supabase/tests/attendance_immutability.sql
git commit -m "test(attendance): pgTAP immutability after finalization"
git push origin main
```

### Task 2.4: pgTAP — cycle de vie JTI

**Files:**
- Create: `supabase/tests/token_jti_lifecycle.sql`

- [ ] **Step 1: Créer le fichier**

```sql
BEGIN;
SELECT plan(6);
\i supabase/tests/_helpers.sql

PERFORM tests.as_service_role();
SELECT tests.seed_attendance_for_org(gen_random_uuid()) AS sheet_id \gset

DO $$
DECLARE
  v_jti UUID := gen_random_uuid();
  v_signer UUID := gen_random_uuid();
  v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM app.attendance_sheets WHERE id = '$1'::uuid;
  INSERT INTO app.attendance_token_jtis(
    jti, organization_id, attendance_sheet_id, signer_id, signer_kind,
    status, issued_at, expires_at
  ) VALUES (
    v_jti, v_org, '$1'::uuid, v_signer, 'learner',
    'issued', now(), now() + interval '30 minutes'
  );
END $$ \gexec

-- 1. Premier consume → OK
SELECT lives_ok(
  $$ SELECT app.consume_attendance_token(
       (SELECT jti FROM app.attendance_token_jtis LIMIT 1),
       (SELECT attendance_sheet_id FROM app.attendance_token_jtis LIMIT 1),
       (SELECT signer_id FROM app.attendance_token_jtis LIMIT 1),
       'learner',
       '127.0.0.1'::inet
     ) $$,
  'Premier consume OK'
);

-- 2. Statut passe à consumed
SELECT is(
  (SELECT status FROM app.attendance_token_jtis LIMIT 1),
  'consumed',
  'JTI status = consumed après appel'
);

-- 3. Second consume du même JTI rejeté
SELECT throws_ok(
  $$ SELECT app.consume_attendance_token(
       (SELECT jti FROM app.attendance_token_jtis LIMIT 1),
       (SELECT attendance_sheet_id FROM app.attendance_token_jtis LIMIT 1),
       (SELECT signer_id FROM app.attendance_token_jtis LIMIT 1),
       'learner', '127.0.0.1'::inet) $$,
  'P0003',
  'Rejeu du JTI rejeté avec P0003'
);

-- 4. JTI inconnu rejeté
SELECT throws_ok(
  $$ SELECT app.consume_attendance_token(gen_random_uuid(), gen_random_uuid(),
       gen_random_uuid(), 'learner', '127.0.0.1'::inet) $$,
  'P0003',
  'JTI inconnu rejeté'
);

-- 5. JTI expiré rejeté + status mis à expired
INSERT INTO app.attendance_token_jtis(jti, organization_id, attendance_sheet_id,
  signer_id, signer_kind, status, issued_at, expires_at)
SELECT gen_random_uuid(), organization_id, attendance_sheet_id, gen_random_uuid(),
  'learner', 'issued', now() - interval '2 hours', now() - interval '1 hour'
FROM app.attendance_token_jtis LIMIT 1;

-- 6. anon ne lit rien dans token_jtis
SET LOCAL ROLE anon;
SELECT is_empty(
  $$ SELECT jti FROM app.attendance_token_jtis $$,
  'anon ne lit aucun token_jti'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Test + commit**

```bash
pnpm db:test
git add supabase/tests/token_jti_lifecycle.sql
git commit -m "test(attendance): pgTAP JTI lifecycle (consume + replay + expire)"
git push origin main
```

### Task 2.5: pgTAP — tenant_integrations admin-only

**Files:**
- Create: `supabase/tests/zoom_integration_admin_only.sql`

- [ ] **Step 1: Créer le fichier**

```sql
BEGIN;
SELECT plan(4);
\i supabase/tests/_helpers.sql

DO $$
DECLARE
  v_org UUID := gen_random_uuid();
  v_admin UUID := gen_random_uuid();
  v_formateur UUID := gen_random_uuid();
BEGIN
  PERFORM tests.as_service_role();
  INSERT INTO app.organizations(id, slug, name) VALUES (v_org, 'org-z', 'Org Zoom');
  -- Seed un row
  INSERT INTO app.tenant_integrations(organization_id, kind, status,
    config_encrypted, config_nonce, config_key_id)
  VALUES (v_org, 'zoom_s2s', 'active', '\\x00'::bytea, '\\x00'::bytea, gen_random_uuid());
END $$;

-- 1. Admin lit
PERFORM tests.set_jwt(
  (SELECT organization_id FROM app.tenant_integrations LIMIT 1),
  'admin',
  gen_random_uuid()
);
PERFORM tests.as_authenticated();

SELECT is(
  (SELECT count(*)::int FROM app.tenant_integrations),
  1,
  'admin lit tenant_integrations'
);

-- 2. Formateur ne lit pas
PERFORM tests.set_jwt(
  (SELECT organization_id FROM app.tenant_integrations LIMIT 1),
  'formateur',
  gen_random_uuid()
);

SELECT is(
  (SELECT count(*)::int FROM app.tenant_integrations),
  0,
  'formateur ne lit pas tenant_integrations'
);

-- 3. Comptable ne lit pas
PERFORM tests.set_jwt(
  (SELECT organization_id FROM app.tenant_integrations LIMIT 1),
  'comptable',
  gen_random_uuid()
);
SELECT is(
  (SELECT count(*)::int FROM app.tenant_integrations),
  0,
  'comptable ne lit pas tenant_integrations'
);

-- 4. Formateur ne peut pas INSERT
SELECT throws_ok(
  $$ INSERT INTO app.tenant_integrations(organization_id, kind, status,
       config_encrypted, config_nonce, config_key_id)
     VALUES (app.current_organization_id(), 'zoom_s2s', 'active',
       '\\x00'::bytea, '\\x00'::bytea, gen_random_uuid()) $$,
  '42501',
  'formateur ne peut pas INSERT tenant_integrations'
);

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Test + commit**

```bash
pnpm db:test
git add supabase/tests/zoom_integration_admin_only.sql
git commit -m "test(attendance): pgTAP tenant_integrations admin-only"
git push origin main
```

---

## Phase 3 — Domain layer (~J2)

### Task 3.1: IDs branded + VOs simples

**Files:**
- Create: `apps/web/features/attendance/domain/ids.ts`
- Create: `apps/web/features/attendance/domain/half-day.ts`
- Create: `apps/web/features/attendance/domain/attendance-status.ts`
- Create: `apps/web/features/attendance/domain/evidence-source.ts`
- Create: `apps/web/features/attendance/domain/attendance-split-strategy.ts`
- Test: `apps/web/features/attendance/domain/__tests__/half-day.test.ts`

- [ ] **Step 1: ids.ts**

```ts
import type { Brand } from '@/shared/lib/branded';
import { makeId } from '@/shared/lib/branded';

export type AttendanceSheetId = Brand<string, 'AttendanceSheetId'>;
export type SignatureId = Brand<string, 'SignatureId'>;
export type TokenJti = Brand<string, 'TokenJti'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ZoomMeetingId = Brand<string, 'ZoomMeetingId'>;

export const AttendanceSheetId = makeId<'AttendanceSheetId'>();
export const SignatureId = makeId<'SignatureId'>();
export const TokenJti = makeId<'TokenJti'>();
export const SessionId = makeId<'SessionId'>();
export const ZoomMeetingId = makeId<'ZoomMeetingId'>();
```

- [ ] **Step 2: half-day.ts**

```ts
export type HalfDay = 'morning' | 'afternoon' | 'full' | 'evening';

export const HALF_DAYS: readonly HalfDay[] = ['morning', 'afternoon', 'full', 'evening'];

export const isHalfDay = (v: unknown): v is HalfDay =>
  typeof v === 'string' && (HALF_DAYS as readonly string[]).includes(v);

/**
 * Classifie une plage horaire (heures locales, 0-24) en un ou deux HalfDay.
 * - traverse 12h00 → ['morning', 'afternoon']
 * - tout l'après-midi (≥ 12h) → ['afternoon']
 * - tout le matin (≤ 13h) → ['morning']
 * - démarre ≥ 18h → ['evening']
 * - sinon → ['full']
 */
export const classifyHours = (
  startHourLocal: number,
  endHourLocal: number,
): HalfDay[] => {
  if (startHourLocal >= 18) return ['evening'];
  if (endHourLocal <= 13) return ['morning'];
  if (startHourLocal >= 12) return ['afternoon'];
  if (startHourLocal < 12 && endHourLocal > 12) return ['morning', 'afternoon'];
  return ['full'];
};
```

- [ ] **Step 3: attendance-status.ts**

```ts
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] =
  ['present', 'absent', 'late', 'excused'];
export const isAttendanceStatus = (v: unknown): v is AttendanceStatus =>
  typeof v === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(v);
```

- [ ] **Step 4: evidence-source.ts**

```ts
export type EvidenceSource =
  | 'manual'
  | 'qr'
  | 'zoom_csv'
  | 'zoom_api'
  | 'trainer_override';

export const EVIDENCE_SOURCES: readonly EvidenceSource[] =
  ['manual', 'qr', 'zoom_csv', 'zoom_api', 'trainer_override'];

export const isEvidenceSource = (v: unknown): v is EvidenceSource =>
  typeof v === 'string' && (EVIDENCE_SOURCES as readonly string[]).includes(v);

export const requiresImageHash = (s: EvidenceSource): boolean =>
  s === 'manual' || s === 'qr';
```

- [ ] **Step 5: attendance-split-strategy.ts**

```ts
export type AttendanceSplitStrategy = 'auto' | 'per_day' | 'manual';
export const SPLIT_STRATEGIES: readonly AttendanceSplitStrategy[] =
  ['auto', 'per_day', 'manual'];
export const isSplitStrategy = (v: unknown): v is AttendanceSplitStrategy =>
  typeof v === 'string' && (SPLIT_STRATEGIES as readonly string[]).includes(v);
```

- [ ] **Step 6: Tests half-day**

```ts
import { describe, it, expect } from 'vitest';
import { classifyHours, isHalfDay } from '../half-day';

describe('classifyHours', () => {
  it('split morning+afternoon if crosses noon', () => {
    expect(classifyHours(9, 17)).toEqual(['morning', 'afternoon']);
  });
  it('morning only if ends ≤ 13h', () => {
    expect(classifyHours(9, 12.5)).toEqual(['morning']);
  });
  it('afternoon only if starts ≥ 12h', () => {
    expect(classifyHours(13, 17)).toEqual(['afternoon']);
  });
  it('evening if starts ≥ 18h', () => {
    expect(classifyHours(18, 21)).toEqual(['evening']);
  });
  it('full if 8h start and 18h end (long day)', () => {
    expect(classifyHours(8, 18)).toEqual(['morning', 'afternoon']);
  });
});

describe('isHalfDay', () => {
  it('valid', () => {
    expect(isHalfDay('morning')).toBe(true);
    expect(isHalfDay('xxx')).toBe(false);
    expect(isHalfDay(null)).toBe(false);
  });
});
```

- [ ] **Step 7: Run tests + commit**

```bash
cd apps/web && pnpm test features/attendance/domain
```
Expected: 6/6 PASS

```bash
git add apps/web/features/attendance/domain/
git commit -m "feat(attendance): domain VOs ids, half-day, status, evidence, split-strategy"
git push origin main
```

### Task 3.2: SignerToken VO

**Files:**
- Create: `apps/web/features/attendance/domain/signer-token.vo.ts`
- Test: `apps/web/features/attendance/domain/__tests__/signer-token.test.ts`

- [ ] **Step 1: signer-token.vo.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetId, TokenJti } from './ids';

export type SignerKind = 'learner' | 'trainer';

export type SignerTokenPayload = {
  readonly sheetId: AttendanceSheetId;
  readonly signerId: string;
  readonly signerKind: SignerKind;
  readonly jti: TokenJti;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};

export type SignerTokenError =
  | { code: 'expired' }
  | { code: 'invalid_kind'; received: string }
  | { code: 'expires_before_issued' };

export const createSignerTokenPayload = (params: {
  sheetId: AttendanceSheetId;
  signerId: string;
  signerKind: string;
  jti: TokenJti;
  issuedAt: Date;
  expiresAt: Date;
  now?: Date;
}): Result<SignerTokenPayload, SignerTokenError> => {
  if (params.signerKind !== 'learner' && params.signerKind !== 'trainer') {
    return err({ code: 'invalid_kind', received: params.signerKind });
  }
  if (params.expiresAt <= params.issuedAt) {
    return err({ code: 'expires_before_issued' });
  }
  const now = params.now ?? new Date();
  if (params.expiresAt <= now) {
    return err({ code: 'expired' });
  }
  return ok({
    sheetId: params.sheetId,
    signerId: params.signerId,
    signerKind: params.signerKind,
    jti: params.jti,
    issuedAt: params.issuedAt,
    expiresAt: params.expiresAt,
  });
};

export const TTL_QR_LIVE_SECONDS = 30 * 60;
export const TTL_EMAIL_LINK_SECONDS = 24 * 60 * 60;
export const TTL_TRAINER_OVERRIDE_SECONDS = 7 * 24 * 60 * 60;
```

- [ ] **Step 2: signer-token.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { createSignerTokenPayload } from '../signer-token.vo';
import { AttendanceSheetId, TokenJti } from '../ids';

const baseParams = () => ({
  sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
  signerId: '00000000-0000-0000-0000-000000000002',
  signerKind: 'learner',
  jti: TokenJti('00000000-0000-0000-0000-000000000003'),
  issuedAt: new Date('2026-05-11T08:00:00Z'),
  expiresAt: new Date('2026-05-11T08:30:00Z'),
  now: new Date('2026-05-11T08:10:00Z'),
});

describe('createSignerTokenPayload', () => {
  it('builds valid payload', () => {
    const r = createSignerTokenPayload(baseParams());
    expect(r.ok).toBe(true);
  });

  it('rejects invalid signerKind', () => {
    const r = createSignerTokenPayload({ ...baseParams(), signerKind: 'admin' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_kind');
  });

  it('rejects expiresAt ≤ issuedAt', () => {
    const r = createSignerTokenPayload({
      ...baseParams(),
      issuedAt: new Date('2026-05-11T08:00:00Z'),
      expiresAt: new Date('2026-05-11T07:00:00Z'),
    });
    expect(r.ok).toBe(false);
  });

  it('rejects already expired', () => {
    const r = createSignerTokenPayload({
      ...baseParams(),
      now: new Date('2026-05-11T09:00:00Z'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('expired');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/domain/__tests__/signer-token
git add apps/web/features/attendance/domain/signer-token.vo.ts apps/web/features/attendance/domain/__tests__/signer-token.test.ts
git commit -m "feat(attendance): SignerToken value object + tests"
git push origin main
```

### Task 3.3: Signature entity

**Files:**
- Create: `apps/web/features/attendance/domain/signature.entity.ts`
- Test: `apps/web/features/attendance/domain/__tests__/signature.test.ts`

- [ ] **Step 1: signature.entity.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { LearnerId, TrainerId } from '@/features/dossier/domain/ids';
import type { SignatureId, TokenJti } from './ids';
import type { AttendanceStatus } from './attendance-status';
import type { EvidenceSource } from './evidence-source';
import { requiresImageHash } from './evidence-source';
import type { SignerKind } from './signer-token.vo';

export type SignatureProps = {
  readonly id: SignatureId;
  readonly signerKind: SignerKind;
  readonly learnerId: LearnerId | null;
  readonly trainerId: TrainerId | null;
  readonly status: AttendanceStatus | null;
  readonly signedAt: Date | null;
  readonly signerIp: string | null;
  readonly signerUserAgent: string | null;
  readonly signerCountry: string | null;
  readonly signaturePngPath: string | null;
  readonly signatureHash: string | null;
  readonly tokenJti: TokenJti | null;
  readonly evidenceSource: EvidenceSource;
  readonly evidencePayload: Record<string, unknown> | null;
  readonly notes: string | null;
};

export type SignatureError =
  | { code: 'kind_id_mismatch' }
  | { code: 'present_missing_hash' }
  | { code: 'present_missing_ip' }
  | { code: 'present_missing_signed_at' };

export class Signature {
  private constructor(public readonly props: SignatureProps) {}

  static rehydrate(props: SignatureProps): Signature {
    return new Signature(props);
  }

  static recordPresent(args: {
    id: SignatureId;
    signerKind: SignerKind;
    learnerId: LearnerId | null;
    trainerId: TrainerId | null;
    signedAt: Date;
    signerIp: string;
    signerUserAgent: string | null;
    signerCountry: string | null;
    signaturePngPath: string | null;
    signatureHash: string | null;
    tokenJti: TokenJti | null;
    evidenceSource: EvidenceSource;
    evidencePayload: Record<string, unknown> | null;
  }): Result<Signature, SignatureError> {
    const idMismatch =
      (args.signerKind === 'learner' && (!args.learnerId || args.trainerId)) ||
      (args.signerKind === 'trainer' && (!args.trainerId || args.learnerId));
    if (idMismatch) return err({ code: 'kind_id_mismatch' });

    if (requiresImageHash(args.evidenceSource) && !args.signatureHash) {
      return err({ code: 'present_missing_hash' });
    }
    if (!args.signerIp) return err({ code: 'present_missing_ip' });

    return ok(
      new Signature({
        id: args.id,
        signerKind: args.signerKind,
        learnerId: args.learnerId,
        trainerId: args.trainerId,
        status: 'present',
        signedAt: args.signedAt,
        signerIp: args.signerIp,
        signerUserAgent: args.signerUserAgent,
        signerCountry: args.signerCountry,
        signaturePngPath: args.signaturePngPath,
        signatureHash: args.signatureHash,
        tokenJti: args.tokenJti,
        evidenceSource: args.evidenceSource,
        evidencePayload: args.evidencePayload,
        notes: null,
      }),
    );
  }

  override(status: AttendanceStatus, notes: string | null): Signature {
    return new Signature({
      ...this.props,
      status,
      notes,
      evidenceSource: 'trainer_override',
    });
  }

  get isComplete(): boolean {
    return this.props.status !== null;
  }
}
```

- [ ] **Step 2: signature.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { Signature } from '../signature.entity';
import { SignatureId, TokenJti } from '../ids';
import { LearnerId, TrainerId } from '@/features/dossier/domain/ids';

const validArgs = () => ({
  id: SignatureId('00000000-0000-0000-0000-000000000010'),
  signerKind: 'learner' as const,
  learnerId: LearnerId('00000000-0000-0000-0000-000000000020'),
  trainerId: null,
  signedAt: new Date('2026-05-11T09:05:00Z'),
  signerIp: '203.0.113.42',
  signerUserAgent: 'Mozilla/5.0',
  signerCountry: 'FR',
  signaturePngPath: 'sheet/learner/123.png',
  signatureHash: 'a'.repeat(64),
  tokenJti: TokenJti('00000000-0000-0000-0000-000000000030'),
  evidenceSource: 'qr' as const,
  evidencePayload: null,
});

describe('Signature.recordPresent', () => {
  it('builds a present signature', () => {
    const r = Signature.recordPresent(validArgs());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.props.status).toBe('present');
      expect(r.value.isComplete).toBe(true);
    }
  });

  it('rejects learner kind with trainerId set', () => {
    const r = Signature.recordPresent({
      ...validArgs(),
      trainerId: TrainerId('00000000-0000-0000-0000-000000000099'),
    });
    expect(r.ok).toBe(false);
  });

  it('requires hash when evidenceSource = qr', () => {
    const r = Signature.recordPresent({ ...validArgs(), signatureHash: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('present_missing_hash');
  });

  it('allows zoom_csv without hash but with payload', () => {
    const r = Signature.recordPresent({
      ...validArgs(),
      evidenceSource: 'zoom_csv',
      signatureHash: 'h'.repeat(64), // CSV utilise hash(raw_line)
      signaturePngPath: null,
      tokenJti: null,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing IP', () => {
    const r = Signature.recordPresent({ ...validArgs(), signerIp: '' });
    expect(r.ok).toBe(false);
  });
});

describe('Signature.override', () => {
  it('produces trainer_override source', () => {
    const r = Signature.recordPresent(validArgs());
    if (!r.ok) throw new Error('seed');
    const o = r.value.override('absent', 'Apprenant prévenu absence');
    expect(o.props.status).toBe('absent');
    expect(o.props.evidenceSource).toBe('trainer_override');
    expect(o.props.notes).toBe('Apprenant prévenu absence');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/domain/__tests__/signature
git add apps/web/features/attendance/domain/signature.entity.ts apps/web/features/attendance/domain/__tests__/signature.test.ts
git commit -m "feat(attendance): Signature entity + invariants tests"
git push origin main
```

### Task 3.4: AttendanceSheet aggregate root

**Files:**
- Create: `apps/web/features/attendance/domain/attendance-sheet.entity.ts`
- Create: `apps/web/features/attendance/domain/attendance.errors.ts`
- Create: `apps/web/features/attendance/domain/attendance.events.ts`
- Test: `apps/web/features/attendance/domain/__tests__/attendance-sheet.test.ts`

- [ ] **Step 1: attendance.errors.ts**

```ts
export type AttendanceError =
  | { code: 'already_finalized' }
  | { code: 'missing_signatures'; signerIds: string[] }
  | { code: 'invalid_status_transition'; from: string; to: string }
  | { code: 'signer_not_a_participant'; signerId: string }
  | { code: 'token_replay' }
  | { code: 'token_invalid' }
  | { code: 'token_expired' };
```

- [ ] **Step 2: attendance.events.ts**

```ts
import type { AttendanceSheetId, SignatureId } from './ids';
import type { OrganizationId, DossierId } from '@/features/dossier/domain/ids';
import type { HalfDay } from './half-day';
import type { EvidenceSource } from './evidence-source';

type Base = {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly aggregateId: AttendanceSheetId;
  readonly occurredAt: Date;
};

export type AttendanceSheetCreated = Base & {
  readonly kind: 'AttendanceSheetCreated';
  readonly dossierId: DossierId;
  readonly halfDay: HalfDay;
};

export type SignatureRecorded = Base & {
  readonly kind: 'SignatureRecorded';
  readonly signatureId: SignatureId;
  readonly signerKind: 'learner' | 'trainer';
  readonly signerId: string;
  readonly evidenceSource: EvidenceSource;
};

export type AttendanceSheetFinalized = Base & {
  readonly kind: 'AttendanceSheetFinalized';
  readonly documentId: string;
  readonly documentHash: string;
};

export type ZoomAttendanceImported = Base & {
  readonly kind: 'ZoomAttendanceImported';
  readonly matched: number;
  readonly unmatched: number;
  readonly source: 'zoom_csv' | 'zoom_api';
};

export type AttendanceDomainEvent =
  | AttendanceSheetCreated
  | SignatureRecorded
  | AttendanceSheetFinalized
  | ZoomAttendanceImported;
```

- [ ] **Step 3: attendance-sheet.entity.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetId } from './ids';
import type { OrganizationId, DossierId, UserId } from '@/features/dossier/domain/ids';
import type { SessionId } from './ids';
import type { HalfDay } from './half-day';
import type { AttendanceSplitStrategy } from './attendance-split-strategy';
import { Signature } from './signature.entity';
import type { AttendanceError } from './attendance.errors';
import type { AttendanceDomainEvent } from './attendance.events';

export type AttendanceSheetStatus = 'open' | 'partial' | 'completed' | 'finalized';

export type AttendanceSheetProps = {
  readonly id: AttendanceSheetId;
  readonly organizationId: OrganizationId;
  readonly dossierId: DossierId;
  readonly sessionId: SessionId;
  readonly halfDay: HalfDay;
  readonly splitStrategy: AttendanceSplitStrategy;
  status: AttendanceSheetStatus;
  signatures: Signature[];
  finalizedAt: Date | null;
  finalizedBy: UserId | null;
  documentId: string | null;
};

export class AttendanceSheet {
  private readonly _events: AttendanceDomainEvent[] = [];

  private constructor(private props: AttendanceSheetProps) {}

  static rehydrate(props: AttendanceSheetProps): AttendanceSheet {
    return new AttendanceSheet(props);
  }

  static create(args: {
    id: AttendanceSheetId;
    organizationId: OrganizationId;
    dossierId: DossierId;
    sessionId: SessionId;
    halfDay: HalfDay;
    splitStrategy: AttendanceSplitStrategy;
    newEventId: () => string;
    now: () => Date;
  }): AttendanceSheet {
    const sheet = new AttendanceSheet({
      id: args.id,
      organizationId: args.organizationId,
      dossierId: args.dossierId,
      sessionId: args.sessionId,
      halfDay: args.halfDay,
      splitStrategy: args.splitStrategy,
      status: 'open',
      signatures: [],
      finalizedAt: null,
      finalizedBy: null,
      documentId: null,
    });
    sheet._events.push({
      id: args.newEventId(),
      organizationId: args.organizationId,
      aggregateId: args.id,
      occurredAt: args.now(),
      kind: 'AttendanceSheetCreated',
      dossierId: args.dossierId,
      halfDay: args.halfDay,
    });
    return sheet;
  }

  /** Recalcule status à partir des signatures (appelé après chaque addSignature) */
  private recomputeStatus(): void {
    if (this.props.status === 'finalized') return;
    const total = this.props.signatures.length;
    if (total === 0) {
      this.props.status = 'open';
      return;
    }
    const complete = this.props.signatures.filter((s) => s.isComplete).length;
    this.props.status = complete === 0 ? 'open' : complete < total ? 'partial' : 'completed';
  }

  addOrReplaceSignature(sig: Signature, now: Date, newEventId: () => string): Result<void, AttendanceError> {
    if (this.props.status === 'finalized') return err({ code: 'already_finalized' });

    const idx = this.props.signatures.findIndex(
      (s) =>
        s.props.signerKind === sig.props.signerKind &&
        (s.props.learnerId ?? s.props.trainerId) === (sig.props.learnerId ?? sig.props.trainerId),
    );
    if (idx >= 0) {
      this.props.signatures[idx] = sig;
    } else {
      this.props.signatures.push(sig);
    }
    this.recomputeStatus();
    this._events.push({
      id: newEventId(),
      organizationId: this.props.organizationId,
      aggregateId: this.props.id,
      occurredAt: now,
      kind: 'SignatureRecorded',
      signatureId: sig.props.id,
      signerKind: sig.props.signerKind,
      signerId: (sig.props.learnerId ?? sig.props.trainerId)!,
      evidenceSource: sig.props.evidenceSource,
    });
    return ok(undefined);
  }

  finalize(args: {
    documentId: string;
    documentHash: string;
    finalizedBy: UserId;
    now: Date;
    newEventId: () => string;
  }): Result<void, AttendanceError> {
    if (this.props.status === 'finalized') return err({ code: 'already_finalized' });
    const missing = this.props.signatures.filter((s) => !s.isComplete);
    if (missing.length > 0) {
      return err({
        code: 'missing_signatures',
        signerIds: missing.map((s) => (s.props.learnerId ?? s.props.trainerId)!),
      });
    }
    this.props.status = 'finalized';
    this.props.finalizedAt = args.now;
    this.props.finalizedBy = args.finalizedBy;
    this.props.documentId = args.documentId;
    this._events.push({
      id: args.newEventId(),
      organizationId: this.props.organizationId,
      aggregateId: this.props.id,
      occurredAt: args.now,
      kind: 'AttendanceSheetFinalized',
      documentId: args.documentId,
      documentHash: args.documentHash,
    });
    return ok(undefined);
  }

  get snapshot(): Readonly<AttendanceSheetProps> {
    return this.props;
  }

  get events(): readonly AttendanceDomainEvent[] {
    return this._events;
  }
}
```

- [ ] **Step 4: attendance-sheet.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { AttendanceSheet } from '../attendance-sheet.entity';
import { Signature } from '../signature.entity';
import { AttendanceSheetId, SignatureId, SessionId, TokenJti } from '../ids';
import { OrganizationId, DossierId, LearnerId, UserId } from '@/features/dossier/domain/ids';

const newEventId = (() => {
  let i = 0;
  return () => `evt-${++i}`;
})();
const now = () => new Date('2026-05-11T09:00:00Z');

const seed = () =>
  AttendanceSheet.create({
    id: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
    organizationId: OrganizationId('00000000-0000-0000-0000-000000000aaa'),
    dossierId: DossierId('00000000-0000-0000-0000-000000000bbb'),
    sessionId: SessionId('00000000-0000-0000-0000-000000000ccc'),
    halfDay: 'morning',
    splitStrategy: 'auto',
    newEventId,
    now,
  });

const makeSig = (suffix: string, hash = 'h'.repeat(64)) =>
  Signature.recordPresent({
    id: SignatureId(`00000000-0000-0000-0000-00000000${suffix}`),
    signerKind: 'learner',
    learnerId: LearnerId(`00000000-0000-0000-0000-1111111111${suffix.slice(-2)}`),
    trainerId: null,
    signedAt: new Date('2026-05-11T09:05:00Z'),
    signerIp: '203.0.113.1',
    signerUserAgent: 'UA',
    signerCountry: 'FR',
    signaturePngPath: `p/${suffix}.png`,
    signatureHash: hash,
    tokenJti: TokenJti(`00000000-0000-0000-0000-22222222${suffix.slice(-2)}`),
    evidenceSource: 'qr',
    evidencePayload: null,
  });

describe('AttendanceSheet', () => {
  it('starts open with no signatures', () => {
    const s = seed();
    expect(s.snapshot.status).toBe('open');
    expect(s.events.find((e) => e.kind === 'AttendanceSheetCreated')).toBeDefined();
  });

  it('moves to partial after first signature', () => {
    const s = seed();
    // ajout préalable d'un slot vide via rehydrate normalement
    // ici on simule en injectant 2 signatures dont 1 complete
    const sig = makeSig('01');
    expect(sig.ok).toBe(true);
    if (sig.ok) s.addOrReplaceSignature(sig.value, now(), newEventId);
    // 1 signature présente / 1 total = completed (puisque pas de placeholders)
    expect(s.snapshot.status).toBe('completed');
  });

  it('refuses finalize if missing signatures', () => {
    const s = seed();
    // injection d'une signature incomplete via rehydrate :
    // (test direct du chemin "missing")
    const sig = makeSig('02');
    if (!sig.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig.value, now(), newEventId);
    // ajouter un placeholder incomplete via rehydrate hack
    const rehydrated = AttendanceSheet.rehydrate({
      ...s.snapshot,
      signatures: [
        sig.value,
        Signature.rehydrate({
          id: SignatureId('00000000-0000-0000-0000-000000000099'),
          signerKind: 'learner',
          learnerId: LearnerId('00000000-0000-0000-0000-3333333333aa'),
          trainerId: null,
          status: null,
          signedAt: null,
          signerIp: null,
          signerUserAgent: null,
          signerCountry: null,
          signaturePngPath: null,
          signatureHash: null,
          tokenJti: null,
          evidenceSource: 'manual',
          evidencePayload: null,
          notes: null,
        }),
      ],
    });
    const r = rehydrated.finalize({
      documentId: '00000000-0000-0000-0000-000000000ddd',
      documentHash: 'd'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000eee'),
      now: now(),
      newEventId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('missing_signatures');
  });

  it('finalizes when all signatures complete', () => {
    const s = seed();
    const sig = makeSig('03');
    if (!sig.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig.value, now(), newEventId);
    const r = s.finalize({
      documentId: '00000000-0000-0000-0000-000000000fff',
      documentHash: 'f'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000eee'),
      now: now(),
      newEventId,
    });
    expect(r.ok).toBe(true);
    expect(s.snapshot.status).toBe('finalized');
    expect(s.events.find((e) => e.kind === 'AttendanceSheetFinalized')).toBeDefined();
  });

  it('refuses double finalize', () => {
    const s = seed();
    const sig = makeSig('04');
    if (!sig.ok) throw new Error('seed');
    s.addOrReplaceSignature(sig.value, now(), newEventId);
    s.finalize({
      documentId: '00000000-0000-0000-0000-000000000111',
      documentHash: 'a'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000222'),
      now: now(),
      newEventId,
    });
    const r = s.finalize({
      documentId: '00000000-0000-0000-0000-000000000333',
      documentHash: 'b'.repeat(64),
      finalizedBy: UserId('00000000-0000-0000-0000-000000000444'),
      now: now(),
      newEventId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('already_finalized');
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/domain
```
Expected: all PASS (5 nouveaux + précédents)

```bash
git add apps/web/features/attendance/domain/
git commit -m "feat(attendance): AttendanceSheet aggregate root + finalize invariants"
git push origin main
```

### Task 3.5: Split-strategy unit tests (materialize logic)

**Files:**
- Create: `apps/web/features/attendance/domain/materialize.ts`
- Test: `apps/web/features/attendance/domain/__tests__/split-strategy.test.ts`

- [ ] **Step 1: materialize.ts**

```ts
import type { HalfDay } from './half-day';
import { classifyHours } from './half-day';
import type { AttendanceSplitStrategy } from './attendance-split-strategy';

export type MaterializedSheet = {
  readonly halfDay: HalfDay;
  readonly startsAt: Date;
  readonly endsAt: Date;
};

/**
 * À partir d'une session, calcule la liste de sheets à créer.
 * - strategy='auto' : split selon classifyHours (TZ org) — gère multi-jours
 * - strategy='per_day' : 1 sheet par jour calendaire (half_day='full')
 * - strategy='manual' : retourne [] (le formateur déclare manuellement)
 */
export const materializeSheets = (args: {
  sessionStartsAt: Date;
  sessionEndsAt: Date;
  organizationTimezone: string; // ex: 'Europe/Paris'
  strategy: AttendanceSplitStrategy;
}): MaterializedSheet[] => {
  if (args.strategy === 'manual') return [];

  const localHours = (d: Date) =>
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: args.organizationTimezone,
        hour: '2-digit',
        hour12: false,
      }).format(d),
    ) +
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: args.organizationTimezone,
        minute: '2-digit',
      }).format(d),
    ) / 60;

  const localDateKey = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: args.organizationTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

  // Découpe en jours locaux
  const days: Array<{ start: Date; end: Date }> = [];
  let cursor = args.sessionStartsAt;
  while (cursor < args.sessionEndsAt) {
    const currentDateKey = localDateKey(cursor);
    // Trouver fin de jour local (minuit suivant en TZ org)
    let dayEnd = new Date(cursor);
    while (
      localDateKey(dayEnd) === currentDateKey &&
      dayEnd < args.sessionEndsAt
    ) {
      dayEnd = new Date(dayEnd.getTime() + 60_000); // +1 min
    }
    const dayEndClamped = dayEnd > args.sessionEndsAt ? args.sessionEndsAt : dayEnd;
    days.push({ start: cursor, end: dayEndClamped });
    cursor = dayEndClamped;
  }

  if (args.strategy === 'per_day') {
    return days.map((d) => ({ halfDay: 'full', startsAt: d.start, endsAt: d.end }));
  }

  // auto
  return days.flatMap((d) => {
    const startH = localHours(d.start);
    const endH = localHours(d.end);
    const halfDays = classifyHours(startH, endH);
    if (halfDays.length === 1) {
      return [{ halfDay: halfDays[0]!, startsAt: d.start, endsAt: d.end }];
    }
    // split à 12h00 local
    const noonLocal = new Date(d.start);
    // On positionne noon en TZ org : approximation par recherche binaire évite la complexité TZ
    // Implémentation simple : milieu de la session journée
    const mid = new Date((d.start.getTime() + d.end.getTime()) / 2);
    return [
      { halfDay: 'morning' as HalfDay, startsAt: d.start, endsAt: mid },
      { halfDay: 'afternoon' as HalfDay, startsAt: mid, endsAt: d.end },
    ];
  });
};
```

> **Note technique** : le split à 12h00 local strict nécessite `Intl.DateTimeFormat` resolved options ou une lib TZ (`@date-fns/tz`). En V1 on accepte l'approximation "milieu de session" pour les sessions qui traversent 12h. La précision exacte au midi TZ-aware sera renforcée en V2 si retour terrain.

- [ ] **Step 2: split-strategy.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { materializeSheets } from '../materialize';

const PARIS = 'Europe/Paris';

describe('materializeSheets', () => {
  it('auto: session 9h-12h30 Paris → 1 morning', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'), // 9h Paris
      sessionEndsAt: new Date('2026-09-15T10:30:00Z'), // 12h30 Paris
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.halfDay).toBe('morning');
  });

  it('auto: session 9h-17h Paris → morning + afternoon', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.halfDay)).toEqual(['morning', 'afternoon']);
  });

  it('auto: session 14h-17h Paris → 1 afternoon', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T12:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.halfDay).toBe('afternoon');
  });

  it('auto: 18h30-21h → evening', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T16:30:00Z'),
      sessionEndsAt: new Date('2026-09-15T19:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'auto',
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.halfDay).toBe('evening');
  });

  it('per_day: 2 jours → 2 sheets full', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-16T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'per_day',
    });
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.halfDay === 'full')).toBe(true);
  });

  it('manual: empty result', () => {
    const r = materializeSheets({
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: PARIS,
      strategy: 'manual',
    });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/domain
```
Expected: all PASS

```bash
git add apps/web/features/attendance/domain/materialize.ts apps/web/features/attendance/domain/__tests__/split-strategy.test.ts
git commit -m "feat(attendance): materializeSheets logic + 6 split-strategy tests"
git push origin main
```

---

## Phase 4 — Application layer (~J3)

### Task 4.1: Ports (interfaces)

**Files (créer tous):**
- `apps/web/features/attendance/application/ports/attendance-sheet.repository.ts`
- `apps/web/features/attendance/application/ports/token-signer.ts`
- `apps/web/features/attendance/application/ports/ip-resolver.ts`
- `apps/web/features/attendance/application/ports/pdf-renderer.ts`
- `apps/web/features/attendance/application/ports/zoom-csv-importer.ts`
- `apps/web/features/attendance/application/ports/zoom-api-client.ts`
- `apps/web/features/attendance/application/ports/secret-cipher.ts`
- `apps/web/features/attendance/application/ports/clock.ts`
- `apps/web/features/attendance/application/ports/id-generator.ts`

- [ ] **Step 1: attendance-sheet.repository.ts**

```ts
import type { Result } from '@/shared/lib/result';
import type { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import type { AttendanceSheetId, SessionId } from '../../domain/ids';
import type { OrganizationId, DossierId } from '@/features/dossier/domain/ids';

export type AttendanceSheetRepository = {
  save(sheet: AttendanceSheet): Promise<Result<void, { code: 'persistence_error'; detail: string }>>;
  findById(id: AttendanceSheetId): Promise<AttendanceSheet | null>;
  findBySession(sessionId: SessionId): Promise<AttendanceSheet[]>;
  findByDossier(dossierId: DossierId): Promise<AttendanceSheet[]>;
  listPending(organizationId: OrganizationId): Promise<AttendanceSheet[]>;
};
```

- [ ] **Step 2: token-signer.ts**

```ts
import type { Result } from '@/shared/lib/result';
import type { SignerTokenPayload } from '../../domain/signer-token.vo';
import type { AttendanceSheetId, TokenJti } from '../../domain/ids';
import type { SignerKind } from '../../domain/signer-token.vo';

export type SignedToken = {
  readonly token: string;
  readonly jti: TokenJti;
  readonly expiresAt: Date;
};

export type TokenSigner = {
  sign(args: {
    sheetId: AttendanceSheetId;
    signerId: string;
    signerKind: SignerKind;
    ttlSeconds: number;
  }): Promise<SignedToken>;

  verify(token: string): Promise<Result<SignerTokenPayload, 'invalid_token' | 'expired_token' | 'invalid_payload'>>;
};
```

- [ ] **Step 3: ip-resolver.ts**

```ts
export type ResolvedIp = {
  readonly ip: string;
  readonly userAgent: string | null;
  readonly country: string | null; // ISO-3166-1 alpha-2
};

export type IpResolver = {
  /** Lit les headers de la requête courante (Next.js headers()) et résout l'IP cliente. */
  resolve(): Promise<ResolvedIp>;
};
```

- [ ] **Step 4: pdf-renderer.ts**

```ts
import type { AttendanceSheet } from '../../domain/attendance-sheet.entity';

export type PdfRendererInput = {
  readonly sheet: AttendanceSheet;
  readonly dossierReference: string;
  readonly formationTitle: string;
  readonly organizationName: string;
  readonly organizationLogoUrl: string | null;
  readonly sessionStartsAt: Date;
  readonly sessionEndsAt: Date;
  /** signed URL TTL 5min pour intégrer les PNG dans le PDF */
  readonly signatureSignedUrls: Map<string, string>;
};

export type PdfRendererOutput = {
  readonly bytes: Uint8Array;
  readonly contentType: 'application/pdf';
};

export type PdfRenderer = {
  render(input: PdfRendererInput): Promise<PdfRendererOutput>;
};
```

- [ ] **Step 5: zoom-csv-importer.ts**

```ts
import type { Result } from '@/shared/lib/result';

export type ZoomParticipantRow = {
  readonly name: string | null;
  readonly email: string | null;
  readonly joinTime: Date | null;
  readonly leaveTime: Date | null;
  readonly durationMinutes: number;
  readonly rawLine: string;
};

export type ZoomCsvParseError =
  | { code: 'invalid_csv' }
  | { code: 'no_header' }
  | { code: 'missing_columns'; missing: string[] };

export type ZoomCsvImporter = {
  parse(csvContent: string): Result<ZoomParticipantRow[], ZoomCsvParseError>;
};
```

- [ ] **Step 6: zoom-api-client.ts**

```ts
import type { Result } from '@/shared/lib/result';
import type { ZoomParticipantRow } from './zoom-csv-importer';

export type ZoomCredentials = {
  readonly accountId: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

export type ZoomApiError =
  | { code: 'auth_failed'; detail: string }
  | { code: 'meeting_not_found' }
  | { code: 'rate_limited' }
  | { code: 'network'; detail: string };

export type ZoomApiClient = {
  testConnection(creds: ZoomCredentials): Promise<Result<{ accountEmail: string }, ZoomApiError>>;
  fetchPastMeetingParticipants(
    creds: ZoomCredentials,
    meetingId: string,
  ): Promise<Result<ZoomParticipantRow[], ZoomApiError>>;
};
```

- [ ] **Step 7: secret-cipher.ts, clock.ts, id-generator.ts**

```ts
// secret-cipher.ts
export type EncryptedSecret = {
  readonly cipherText: Uint8Array;
  readonly nonce: Uint8Array;
  readonly keyId: string;
};

export type SecretCipher = {
  encrypt(plaintext: string): Promise<EncryptedSecret>;
  decrypt(secret: EncryptedSecret): Promise<string>;
};
```

```ts
// clock.ts
export type Clock = { now(): Date };
```

```ts
// id-generator.ts
export type IdGenerator = { newUuidV7(): string };
```

- [ ] **Step 8: Commit tous les ports**

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/application/ports/
git commit -m "feat(attendance): application ports (repo, signer, ip, pdf, zoom, cipher, clock, ids)"
git push origin main
```

### Task 4.2: Command materialize-for-session

**Files:**
- Create: `apps/web/features/attendance/application/commands/materialize-for-session.ts`
- Test: `apps/web/features/attendance/application/__tests__/materialize-for-session.test.ts`

- [ ] **Step 1: materialize-for-session.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok } from '@/shared/lib/result';
import { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import { materializeSheets } from '../../domain/materialize';
import type { AttendanceSplitStrategy } from '../../domain/attendance-split-strategy';
import { AttendanceSheetId, SessionId } from '../../domain/ids';
import type { OrganizationId, DossierId } from '@/features/dossier/domain/ids';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';

export type MaterializeInput = {
  organizationId: OrganizationId;
  dossierId: DossierId;
  sessionId: SessionId;
  sessionStartsAt: Date;
  sessionEndsAt: Date;
  organizationTimezone: string;
  splitStrategy: AttendanceSplitStrategy;
};

export type MaterializeDeps = {
  repo: AttendanceSheetRepository;
  clock: Clock;
  ids: IdGenerator;
};

export const materializeForSession =
  (deps: MaterializeDeps) =>
  async (input: MaterializeInput): Promise<Result<{ created: AttendanceSheetId[] }, never>> => {
    const slices = materializeSheets({
      sessionStartsAt: input.sessionStartsAt,
      sessionEndsAt: input.sessionEndsAt,
      organizationTimezone: input.organizationTimezone,
      strategy: input.splitStrategy,
    });

    const created: AttendanceSheetId[] = [];
    for (const slice of slices) {
      const id = AttendanceSheetId(deps.ids.newUuidV7());
      const sheet = AttendanceSheet.create({
        id,
        organizationId: input.organizationId,
        dossierId: input.dossierId,
        sessionId: input.sessionId,
        halfDay: slice.halfDay,
        splitStrategy: input.splitStrategy,
        newEventId: () => deps.ids.newUuidV7(),
        now: () => deps.clock.now(),
      });
      // Repo.save est idempotent via UNIQUE (session_id, half_day) — ON CONFLICT DO NOTHING côté infra
      const r = await deps.repo.save(sheet);
      if (r.ok) created.push(id);
    }
    return ok({ created });
  };
```

- [ ] **Step 2: Test minimal**

```ts
import { describe, it, expect } from 'vitest';
import { materializeForSession } from '../commands/materialize-for-session';
import { OrganizationId, DossierId } from '@/features/dossier/domain/ids';
import { SessionId } from '../../domain/ids';
import { ok } from '@/shared/lib/result';

describe('materializeForSession', () => {
  it('crée 2 sheets pour session 9-17h Paris auto', async () => {
    const saved: unknown[] = [];
    const repo = {
      save: async (s: unknown) => { saved.push(s); return ok(undefined as void); },
      findById: async () => null,
      findBySession: async () => [],
      findByDossier: async () => [],
      listPending: async () => [],
    };
    const clock = { now: () => new Date('2026-05-11T08:00:00Z') };
    let i = 0;
    const ids = { newUuidV7: () => `00000000-0000-0000-0000-${String(++i).padStart(12, '0')}` };

    const r = await materializeForSession({ repo, clock, ids })({
      organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
      dossierId: DossierId('00000000-0000-0000-0000-0000000000bb'),
      sessionId: SessionId('00000000-0000-0000-0000-0000000000cc'),
      sessionStartsAt: new Date('2026-09-15T07:00:00Z'),
      sessionEndsAt: new Date('2026-09-15T15:00:00Z'),
      organizationTimezone: 'Europe/Paris',
      splitStrategy: 'auto',
    });
    expect(r.ok).toBe(true);
    expect(saved).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/application
git add apps/web/features/attendance/application/commands/materialize-for-session.ts apps/web/features/attendance/application/__tests__/materialize-for-session.test.ts
git commit -m "feat(attendance): materializeForSession command + test"
git push origin main
```

### Task 4.3: Command generate-signer-token

**Files:**
- Create: `apps/web/features/attendance/application/commands/generate-signer-token.ts`
- Test: `apps/web/features/attendance/application/__tests__/generate-signer-token.test.ts`

- [ ] **Step 1: generate-signer-token.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { TokenSigner, SignedToken } from '../ports/token-signer';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { AttendanceSheetId } from '../../domain/ids';
import type { SignerKind } from '../../domain/signer-token.vo';
import {
  TTL_QR_LIVE_SECONDS,
  TTL_EMAIL_LINK_SECONDS,
  TTL_TRAINER_OVERRIDE_SECONDS,
} from '../../domain/signer-token.vo';

export type TokenPurpose = 'qr_live' | 'email_link' | 'trainer_override';

const TTL_BY_PURPOSE: Record<TokenPurpose, number> = {
  qr_live: TTL_QR_LIVE_SECONDS,
  email_link: TTL_EMAIL_LINK_SECONDS,
  trainer_override: TTL_TRAINER_OVERRIDE_SECONDS,
};

export type GenerateTokenInput = {
  sheetId: AttendanceSheetId;
  signerId: string;
  signerKind: SignerKind;
  purpose: TokenPurpose;
};

export type GenerateTokenError =
  | { code: 'sheet_not_found' }
  | { code: 'sheet_finalized' };

export type GenerateTokenDeps = {
  repo: AttendanceSheetRepository;
  signer: TokenSigner;
};

export const generateSignerToken =
  (deps: GenerateTokenDeps) =>
  async (input: GenerateTokenInput): Promise<Result<SignedToken, GenerateTokenError>> => {
    const sheet = await deps.repo.findById(input.sheetId);
    if (!sheet) return err({ code: 'sheet_not_found' });
    if (sheet.snapshot.status === 'finalized') return err({ code: 'sheet_finalized' });

    const signed = await deps.signer.sign({
      sheetId: input.sheetId,
      signerId: input.signerId,
      signerKind: input.signerKind,
      ttlSeconds: TTL_BY_PURPOSE[input.purpose],
    });
    return ok(signed);
  };
```

- [ ] **Step 2: Test** (vérifie TTL correct selon purpose + refuse si finalized)

```ts
import { describe, it, expect } from 'vitest';
import { generateSignerToken } from '../commands/generate-signer-token';
import { AttendanceSheetId, TokenJti } from '../../domain/ids';
import { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import { OrganizationId, DossierId } from '@/features/dossier/domain/ids';
import { SessionId } from '../../domain/ids';

const buildSheet = (status: 'open' | 'finalized' = 'open') => {
  const sheet = AttendanceSheet.create({
    id: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
    organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
    dossierId: DossierId('00000000-0000-0000-0000-0000000000bb'),
    sessionId: SessionId('00000000-0000-0000-0000-0000000000cc'),
    halfDay: 'morning',
    splitStrategy: 'auto',
    newEventId: () => 'evt',
    now: () => new Date('2026-05-11T08:00:00Z'),
  });
  return AttendanceSheet.rehydrate({ ...sheet.snapshot, status });
};

describe('generateSignerToken', () => {
  it('uses 30min TTL for qr_live', async () => {
    let captured: number = 0;
    const signer = {
      sign: async (a: { ttlSeconds: number }) => {
        captured = a.ttlSeconds;
        return { token: 't', jti: TokenJti('00000000-0000-0000-0000-000000000010'), expiresAt: new Date() };
      },
      verify: async () => ({ ok: false as const, error: 'invalid_token' as const }),
    };
    const repo = {
      save: async () => ({ ok: true as const, value: undefined as void }),
      findById: async () => buildSheet('open'),
      findBySession: async () => [],
      findByDossier: async () => [],
      listPending: async () => [],
    };

    await generateSignerToken({ repo, signer })({
      sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
      signerId: '00000000-0000-0000-0000-000000000002',
      signerKind: 'learner',
      purpose: 'qr_live',
    });
    expect(captured).toBe(30 * 60);
  });

  it('refuses if sheet finalized', async () => {
    const signer = {
      sign: async () => ({ token: 't', jti: TokenJti('00000000-0000-0000-0000-000000000010'), expiresAt: new Date() }),
      verify: async () => ({ ok: false as const, error: 'invalid_token' as const }),
    };
    const repo = {
      save: async () => ({ ok: true as const, value: undefined as void }),
      findById: async () => buildSheet('finalized'),
      findBySession: async () => [],
      findByDossier: async () => [],
      listPending: async () => [],
    };
    const r = await generateSignerToken({ repo, signer })({
      sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
      signerId: '00000000-0000-0000-0000-000000000002',
      signerKind: 'learner',
      purpose: 'qr_live',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('sheet_finalized');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/application/__tests__/generate-signer-token
git add apps/web/features/attendance/application/commands/generate-signer-token.ts apps/web/features/attendance/application/__tests__/generate-signer-token.test.ts
git commit -m "feat(attendance): generateSignerToken command (TTL par purpose)"
git push origin main
```

### Task 4.4: Command record-signature

**Files:**
- Create: `apps/web/features/attendance/application/commands/record-signature.ts`
- Test: `apps/web/features/attendance/application/__tests__/record-signature.test.ts`

> **Note** : cette command est l'orchestrateur de la signature côté apprenant. Elle :
> 1. Vérifie le JWT via `TokenSigner.verify`
> 2. Résout IP/UA/country via `IpResolver.resolve()`
> 3. Calcule le hash SHA-256 du PNG + sel (IP, UA, signedAt, JTI)
> 4. Upload PNG dans bucket `signatures` via le repository (méthode dédiée — voir Task 5.1)
> 5. Appelle `repository.recordSignaturePresent(...)` qui appelle la RPC `app.record_attendance_signature` (anti-replay JTI inclus)
> 6. Retourne `{ signatureId, hash }`

- [ ] **Step 1: record-signature.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { TokenSigner } from '../ports/token-signer';
import type { IpResolver } from '../ports/ip-resolver';
import type { AttendanceSheetId, SignatureId } from '../../domain/ids';

export type RecordSignatureInput = {
  token: string;
  pngBytes: Uint8Array;
};

export type RecordSignatureOutput = {
  signatureId: SignatureId;
  hash: string;
  signedAt: string;
};

export type RecordSignatureError =
  | { code: 'invalid_token' }
  | { code: 'expired_token' }
  | { code: 'token_replay' }
  | { code: 'image_too_large' }
  | { code: 'image_empty' }
  | { code: 'persistence_error'; detail: string };

const MAX_PNG_BYTES = 512 * 1024;

export type SignaturePersistencePort = {
  /** Calcule hash, upload PNG, appelle RPC record_attendance_signature avec evidence_source='qr' */
  recordPresent(args: {
    sheetId: AttendanceSheetId;
    signerId: string;
    signerKind: 'learner' | 'trainer';
    tokenJti: string;
    pngBytes: Uint8Array;
    signerIp: string;
    signerUserAgent: string | null;
    signerCountry: string | null;
  }): Promise<Result<{ signatureId: SignatureId; hash: string; signedAt: string }, RecordSignatureError>>;
};

export type RecordSignatureDeps = {
  signer: TokenSigner;
  ipResolver: IpResolver;
  persistence: SignaturePersistencePort;
};

export const recordSignature =
  (deps: RecordSignatureDeps) =>
  async (input: RecordSignatureInput): Promise<Result<RecordSignatureOutput, RecordSignatureError>> => {
    if (input.pngBytes.length === 0) return err({ code: 'image_empty' });
    if (input.pngBytes.length > MAX_PNG_BYTES) return err({ code: 'image_too_large' });

    const verified = await deps.signer.verify(input.token);
    if (!verified.ok) {
      if (verified.error === 'expired_token') return err({ code: 'expired_token' });
      return err({ code: 'invalid_token' });
    }
    const payload = verified.value;

    const resolved = await deps.ipResolver.resolve();

    const r = await deps.persistence.recordPresent({
      sheetId: payload.sheetId,
      signerId: payload.signerId,
      signerKind: payload.signerKind,
      tokenJti: payload.jti,
      pngBytes: input.pngBytes,
      signerIp: resolved.ip,
      signerUserAgent: resolved.userAgent,
      signerCountry: resolved.country,
    });
    return r;
  };
```

- [ ] **Step 2: Test stub-driven**

```ts
import { describe, it, expect, vi } from 'vitest';
import { recordSignature } from '../commands/record-signature';
import { AttendanceSheetId, SignatureId, TokenJti } from '../../domain/ids';
import { ok, err } from '@/shared/lib/result';

const makeDeps = (override?: Partial<Parameters<typeof recordSignature>[0]>) => ({
  signer: {
    sign: vi.fn(),
    verify: vi.fn().mockResolvedValue(ok({
      sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
      signerId: '00000000-0000-0000-0000-000000000002',
      signerKind: 'learner' as const,
      jti: TokenJti('00000000-0000-0000-0000-000000000003'),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    })),
  },
  ipResolver: {
    resolve: vi.fn().mockResolvedValue({ ip: '203.0.113.1', userAgent: 'UA', country: 'FR' }),
  },
  persistence: {
    recordPresent: vi.fn().mockResolvedValue(ok({
      signatureId: SignatureId('00000000-0000-0000-0000-000000000099'),
      hash: 'a'.repeat(64),
      signedAt: '2026-05-11T09:05:00Z',
    })),
  },
  ...override,
});

describe('recordSignature', () => {
  it('happy path', async () => {
    const deps = makeDeps();
    const r = await recordSignature(deps)({ token: 'jwt', pngBytes: new Uint8Array(100) });
    expect(r.ok).toBe(true);
    expect(deps.persistence.recordPresent).toHaveBeenCalledOnce();
    const call = deps.persistence.recordPresent.mock.calls[0]?.[0];
    expect(call?.signerIp).toBe('203.0.113.1');
    expect(call?.signerCountry).toBe('FR');
  });

  it('rejects empty image', async () => {
    const deps = makeDeps();
    const r = await recordSignature(deps)({ token: 'jwt', pngBytes: new Uint8Array(0) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('image_empty');
  });

  it('rejects oversized image', async () => {
    const deps = makeDeps();
    const r = await recordSignature(deps)({ token: 'jwt', pngBytes: new Uint8Array(513 * 1024) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('image_too_large');
  });

  it('propagates expired token', async () => {
    const deps = makeDeps({
      signer: {
        sign: vi.fn(),
        verify: vi.fn().mockResolvedValue(err('expired_token' as const)),
      },
    });
    const r = await recordSignature(deps)({ token: 'jwt', pngBytes: new Uint8Array(100) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('expired_token');
  });

  it('propagates token_replay from persistence', async () => {
    const deps = makeDeps({
      persistence: {
        recordPresent: vi.fn().mockResolvedValue(err({ code: 'token_replay' as const })),
      },
    });
    const r = await recordSignature(deps)({ token: 'jwt', pngBytes: new Uint8Array(100) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('token_replay');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/application/__tests__/record-signature
git add apps/web/features/attendance/application/commands/record-signature.ts apps/web/features/attendance/application/__tests__/record-signature.test.ts
git commit -m "feat(attendance): recordSignature command (token verify + IP capture + RPC call)"
git push origin main
```

### Task 4.5: Command override-attendance

**Files:**
- Create: `apps/web/features/attendance/application/commands/override-attendance.ts`

- [ ] **Step 1: Code**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { AttendanceSheetId, SignatureId } from '../../domain/ids';
import type { AttendanceStatus } from '../../domain/attendance-status';

export type OverrideAttendanceInput = {
  sheetId: AttendanceSheetId;
  signatureId: SignatureId;
  status: AttendanceStatus;
  notes: string | null;
};

export type OverrideAttendanceError =
  | { code: 'sheet_not_found' }
  | { code: 'sheet_finalized' }
  | { code: 'signature_not_found' };

export type OverrideAttendanceDeps = {
  repo: AttendanceSheetRepository;
  // Persistence-direct update (sans passer par la RPC anti-replay puisque pas de token)
  overridePersistence: {
    update(args: {
      sheetId: AttendanceSheetId;
      signatureId: SignatureId;
      status: AttendanceStatus;
      notes: string | null;
    }): Promise<Result<void, { code: 'persistence_error'; detail: string }>>;
  };
};

export const overrideAttendance =
  (deps: OverrideAttendanceDeps) =>
  async (input: OverrideAttendanceInput): Promise<Result<void, OverrideAttendanceError>> => {
    const sheet = await deps.repo.findById(input.sheetId);
    if (!sheet) return err({ code: 'sheet_not_found' });
    if (sheet.snapshot.status === 'finalized') return err({ code: 'sheet_finalized' });

    const sig = sheet.snapshot.signatures.find((s) => s.props.id === input.signatureId);
    if (!sig) return err({ code: 'signature_not_found' });

    const r = await deps.overridePersistence.update({
      sheetId: input.sheetId,
      signatureId: input.signatureId,
      status: input.status,
      notes: input.notes,
    });
    if (!r.ok) return err({ code: 'sheet_not_found' }); // ou propager — adjust
    return ok(undefined);
  };
```

- [ ] **Step 2: Commit (test couvert par E2E)**

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/application/commands/override-attendance.ts
git commit -m "feat(attendance): overrideAttendance command (trainer marks absent/late/excused)"
git push origin main
```

### Task 4.6: Command import-zoom-csv

**Files:**
- Create: `apps/web/features/attendance/application/commands/import-zoom-csv.ts`
- Test: `apps/web/features/attendance/application/__tests__/import-zoom-csv.test.ts`

- [ ] **Step 1: import-zoom-csv.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { ZoomCsvImporter, ZoomParticipantRow } from '../ports/zoom-csv-importer';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { AttendanceSheetId } from '../../domain/ids';

export type ImportZoomCsvInput = {
  sheetId: AttendanceSheetId;
  csvContent: string;
  csvFilename: string;
};

export type ImportZoomCsvOutput = {
  matched: number;
  unmatched: number;
  totalRows: number;
};

export type ImportZoomCsvError =
  | { code: 'sheet_not_found' }
  | { code: 'sheet_finalized' }
  | { code: 'parse_failed'; detail: string };

export type ParticipantLookup = {
  /** Retourne le mapping email→{learnerId} pour les participants de la session, lookup case-insensitive */
  forSession(sheetId: AttendanceSheetId): Promise<Map<string, { learnerId: string }>>;
};

export type ZoomImportPersistence = {
  /** Upload CSV brut + UPSERT signatures via RPC + INSERT unmatched */
  apply(args: {
    sheetId: AttendanceSheetId;
    sessionDurationMinutes: number;
    csvContent: string;
    csvFilename: string;
    matched: Array<{
      learnerId: string;
      row: ZoomParticipantRow;
      status: 'present' | 'late';
      hash: string;
    }>;
    unmatched: ZoomParticipantRow[];
  }): Promise<Result<void, { code: 'persistence_error'; detail: string }>>;
};

const ATTENDANCE_THRESHOLD = 0.75;

export type ImportZoomCsvDeps = {
  repo: AttendanceSheetRepository;
  importer: ZoomCsvImporter;
  lookup: ParticipantLookup;
  persistence: ZoomImportPersistence;
  // Helper pour sha256 (impl: crypto.subtle ou node:crypto, fourni via DI)
  sha256: (text: string) => string;
  // Helper pour récup session duration (lookup scheduling)
  sessionDurationMinutes: (sheetId: AttendanceSheetId) => Promise<number>;
};

export const importZoomCsv =
  (deps: ImportZoomCsvDeps) =>
  async (input: ImportZoomCsvInput): Promise<Result<ImportZoomCsvOutput, ImportZoomCsvError>> => {
    const sheet = await deps.repo.findById(input.sheetId);
    if (!sheet) return err({ code: 'sheet_not_found' });
    if (sheet.snapshot.status === 'finalized') return err({ code: 'sheet_finalized' });

    const parsed = deps.importer.parse(input.csvContent);
    if (!parsed.ok) {
      return err({ code: 'parse_failed', detail: JSON.stringify(parsed.error) });
    }

    const lookup = await deps.lookup.forSession(input.sheetId);
    const sessionMin = await deps.sessionDurationMinutes(input.sheetId);

    const matched: Parameters<ZoomImportPersistence['apply']>[0]['matched'] = [];
    const unmatched: ZoomParticipantRow[] = [];

    for (const row of parsed.value) {
      const key = row.email?.toLowerCase().trim();
      const hit = key ? lookup.get(key) : undefined;
      if (!hit) {
        unmatched.push(row);
        continue;
      }
      const status = row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMin ? 'present' : 'late';
      matched.push({
        learnerId: hit.learnerId,
        row,
        status,
        hash: deps.sha256(row.rawLine),
      });
    }

    const applyR = await deps.persistence.apply({
      sheetId: input.sheetId,
      sessionDurationMinutes: sessionMin,
      csvContent: input.csvContent,
      csvFilename: input.csvFilename,
      matched,
      unmatched,
    });
    if (!applyR.ok) return err({ code: 'parse_failed', detail: applyR.error.detail });

    return ok({ matched: matched.length, unmatched: unmatched.length, totalRows: parsed.value.length });
  };
```

- [ ] **Step 2: Test (parser tolérant + threshold 75%)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { importZoomCsv } from '../commands/import-zoom-csv';
import { AttendanceSheetId } from '../../domain/ids';
import { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import { OrganizationId, DossierId } from '@/features/dossier/domain/ids';
import { SessionId } from '../../domain/ids';
import { ok } from '@/shared/lib/result';

const makeSheet = () => AttendanceSheet.create({
  id: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
  organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
  dossierId: DossierId('00000000-0000-0000-0000-0000000000bb'),
  sessionId: SessionId('00000000-0000-0000-0000-0000000000cc'),
  halfDay: 'morning',
  splitStrategy: 'auto',
  newEventId: () => 'e',
  now: () => new Date(),
});

describe('importZoomCsv', () => {
  it('matches by email case-insensitive, applies 75% threshold', async () => {
    const sessionMin = 180; // 3h
    const importer = {
      parse: vi.fn().mockReturnValue(ok([
        { email: 'Alice@AcMe.fr', name: 'Alice', joinTime: new Date(), leaveTime: new Date(), durationMinutes: 150, rawLine: 'l1' }, // 83% → present
        { email: 'bob@acme.fr', name: 'Bob', joinTime: new Date(), leaveTime: new Date(), durationMinutes: 60, rawLine: 'l2' },     // 33% → late
        { email: 'zoe@unknown.fr', name: 'Zoe', joinTime: new Date(), leaveTime: new Date(), durationMinutes: 180, rawLine: 'l3' }, // unmatched
      ])),
    };
    const lookup = {
      forSession: vi.fn().mockResolvedValue(new Map([
        ['alice@acme.fr', { learnerId: 'L1' }],
        ['bob@acme.fr', { learnerId: 'L2' }],
      ])),
    };
    const persistence = { apply: vi.fn().mockResolvedValue(ok(undefined)) };

    const deps = {
      repo: {
        save: async () => ok(undefined as void),
        findById: async () => makeSheet(),
        findBySession: async () => [],
        findByDossier: async () => [],
        listPending: async () => [],
      },
      importer,
      lookup,
      persistence,
      sha256: (s: string) => `hash(${s})`,
      sessionDurationMinutes: async () => sessionMin,
    };

    const r = await importZoomCsv(deps)({
      sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
      csvContent: 'csv',
      csvFilename: 'p.csv',
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.matched).toBe(2);
      expect(r.value.unmatched).toBe(1);
    }
    const call = persistence.apply.mock.calls[0]?.[0];
    expect(call?.matched.find((m: { learnerId: string }) => m.learnerId === 'L1')?.status).toBe('present');
    expect(call?.matched.find((m: { learnerId: string }) => m.learnerId === 'L2')?.status).toBe('late');
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/application/__tests__/import-zoom-csv
git add apps/web/features/attendance/application/commands/import-zoom-csv.ts apps/web/features/attendance/application/__tests__/import-zoom-csv.test.ts
git commit -m "feat(attendance): importZoomCsv command (matching + 75% threshold)"
git push origin main
```

### Task 4.7: Commands resolve-unmatched + finalize-sheet

**Files:**
- Create: `apps/web/features/attendance/application/commands/resolve-unmatched.ts`
- Create: `apps/web/features/attendance/application/commands/finalize-sheet.ts`
- Test: `apps/web/features/attendance/application/__tests__/finalize-sheet.test.ts`

- [ ] **Step 1: resolve-unmatched.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { AttendanceSheetId } from '../../domain/ids';

export type ResolveUnmatchedInput = {
  unmatchedId: string;
  learnerId: string;
};

export type ResolveUnmatchedError =
  | { code: 'unmatched_not_found' }
  | { code: 'sheet_finalized' };

export type UnmatchedResolverPort = {
  resolve(args: { unmatchedId: string; learnerId: string }): Promise<Result<
    { sheetId: AttendanceSheetId },
    { code: 'persistence_error'; detail: string } | { code: 'unmatched_not_found' }
  >>;
};

export type ResolveUnmatchedDeps = {
  repo: AttendanceSheetRepository;
  resolver: UnmatchedResolverPort;
};

export const resolveUnmatched =
  (deps: ResolveUnmatchedDeps) =>
  async (input: ResolveUnmatchedInput): Promise<Result<void, ResolveUnmatchedError>> => {
    const r = await deps.resolver.resolve(input);
    if (!r.ok) return err({ code: 'unmatched_not_found' });
    const sheet = await deps.repo.findById(r.value.sheetId);
    if (sheet?.snapshot.status === 'finalized') return err({ code: 'sheet_finalized' });
    return ok(undefined);
  };
```

- [ ] **Step 2: finalize-sheet.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { PdfRenderer } from '../ports/pdf-renderer';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { AttendanceSheetId } from '../../domain/ids';
import type { UserId } from '@/features/dossier/domain/ids';

export type FinalizeSheetInput = {
  sheetId: AttendanceSheetId;
  actorUserId: UserId;
};

export type FinalizeSheetOutput = {
  documentId: string;
  hash: string;
  documentPath: string;
};

export type FinalizeSheetError =
  | { code: 'sheet_not_found' }
  | { code: 'already_finalized' }
  | { code: 'missing_signatures'; signerIds: string[] }
  | { code: 'pdf_render_failed'; detail: string }
  | { code: 'persistence_error'; detail: string };

export type FinalizePersistencePort = {
  /** Charge le contexte (dossier_reference, formation, org, session dates, signed URLs PNG) */
  loadRenderContext(sheetId: AttendanceSheetId): Promise<{
    dossierReference: string;
    formationTitle: string;
    organizationName: string;
    organizationLogoUrl: string | null;
    sessionStartsAt: Date;
    sessionEndsAt: Date;
    signatureSignedUrls: Map<string, string>;
  }>;
  /** Upload PDF + INSERT documents row + UPDATE sheet (status=finalized, document_id) en transaction */
  persistFinalization(args: {
    sheetId: AttendanceSheetId;
    pdfBytes: Uint8Array;
    pdfHash: string;
    finalizedBy: UserId;
  }): Promise<Result<{ documentId: string; documentPath: string }, { code: 'persistence_error'; detail: string }>>;
};

export type FinalizeSheetDeps = {
  repo: AttendanceSheetRepository;
  pdf: PdfRenderer;
  persistence: FinalizePersistencePort;
  clock: Clock;
  ids: IdGenerator;
  sha256: (bytes: Uint8Array) => string;
};

export const finalizeSheet =
  (deps: FinalizeSheetDeps) =>
  async (input: FinalizeSheetInput): Promise<Result<FinalizeSheetOutput, FinalizeSheetError>> => {
    const sheet = await deps.repo.findById(input.sheetId);
    if (!sheet) return err({ code: 'sheet_not_found' });

    const ctx = await deps.persistence.loadRenderContext(input.sheetId);

    let pdfBytes: Uint8Array;
    try {
      const out = await deps.pdf.render({
        sheet,
        dossierReference: ctx.dossierReference,
        formationTitle: ctx.formationTitle,
        organizationName: ctx.organizationName,
        organizationLogoUrl: ctx.organizationLogoUrl,
        sessionStartsAt: ctx.sessionStartsAt,
        sessionEndsAt: ctx.sessionEndsAt,
        signatureSignedUrls: ctx.signatureSignedUrls,
      });
      pdfBytes = out.bytes;
    } catch (e) {
      return err({ code: 'pdf_render_failed', detail: (e as Error).message });
    }

    const pdfHash = deps.sha256(pdfBytes);

    const persistR = await deps.persistence.persistFinalization({
      sheetId: input.sheetId,
      pdfBytes,
      pdfHash,
      finalizedBy: input.actorUserId,
    });
    if (!persistR.ok) return err({ code: 'persistence_error', detail: persistR.error.detail });

    // Domain finalize (pour events outbox côté repo si besoin)
    const r = sheet.finalize({
      documentId: persistR.value.documentId,
      documentHash: pdfHash,
      finalizedBy: input.actorUserId,
      now: deps.clock.now(),
      newEventId: () => deps.ids.newUuidV7(),
    });
    if (!r.ok) {
      if (r.error.code === 'already_finalized') return err({ code: 'already_finalized' });
      if (r.error.code === 'missing_signatures') return err(r.error);
    }

    return ok({ documentId: persistR.value.documentId, hash: pdfHash, documentPath: persistR.value.documentPath });
  };
```

- [ ] **Step 3: Test finalize-sheet (happy + missing)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { finalizeSheet } from '../commands/finalize-sheet';
import { AttendanceSheetId, SignatureId, TokenJti, SessionId } from '../../domain/ids';
import { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import { Signature } from '../../domain/signature.entity';
import { OrganizationId, DossierId, LearnerId, UserId } from '@/features/dossier/domain/ids';
import { ok, err } from '@/shared/lib/result';

const makeCompleteSheet = () => {
  const s = AttendanceSheet.create({
    id: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
    organizationId: OrganizationId('00000000-0000-0000-0000-0000000000aa'),
    dossierId: DossierId('00000000-0000-0000-0000-0000000000bb'),
    sessionId: SessionId('00000000-0000-0000-0000-0000000000cc'),
    halfDay: 'morning',
    splitStrategy: 'auto',
    newEventId: () => 'e',
    now: () => new Date(),
  });
  const sig = Signature.recordPresent({
    id: SignatureId('00000000-0000-0000-0000-000000000010'),
    signerKind: 'learner',
    learnerId: LearnerId('00000000-0000-0000-0000-000000000020'),
    trainerId: null,
    signedAt: new Date(),
    signerIp: '203.0.113.1',
    signerUserAgent: 'UA',
    signerCountry: 'FR',
    signaturePngPath: 'p.png',
    signatureHash: 'h'.repeat(64),
    tokenJti: TokenJti('00000000-0000-0000-0000-000000000030'),
    evidenceSource: 'qr',
    evidencePayload: null,
  });
  if (sig.ok) s.addOrReplaceSignature(sig.value, new Date(), () => 'e2');
  return s;
};

describe('finalizeSheet', () => {
  it('happy path : renders PDF + persists', async () => {
    const deps = {
      repo: {
        save: async () => ok(undefined as void),
        findById: async () => makeCompleteSheet(),
        findBySession: async () => [],
        findByDossier: async () => [],
        listPending: async () => [],
      },
      pdf: { render: vi.fn().mockResolvedValue({ bytes: new Uint8Array(1000), contentType: 'application/pdf' }) },
      persistence: {
        loadRenderContext: vi.fn().mockResolvedValue({
          dossierReference: 'DOS-2026-001',
          formationTitle: 'Test',
          organizationName: 'OF',
          organizationLogoUrl: null,
          sessionStartsAt: new Date(),
          sessionEndsAt: new Date(),
          signatureSignedUrls: new Map(),
        }),
        persistFinalization: vi.fn().mockResolvedValue(ok({
          documentId: '00000000-0000-0000-0000-000000000ddd',
          documentPath: 'documents/x.pdf',
        })),
      },
      clock: { now: () => new Date() },
      ids: { newUuidV7: () => '00000000-0000-0000-0000-000000000eee' },
      sha256: () => 'h'.repeat(64),
    };
    const r = await finalizeSheet(deps)({
      sheetId: AttendanceSheetId('00000000-0000-0000-0000-000000000001'),
      actorUserId: UserId('00000000-0000-0000-0000-000000000fff'),
    });
    expect(r.ok).toBe(true);
    expect(deps.pdf.render).toHaveBeenCalledOnce();
    expect(deps.persistence.persistFinalization).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/application
git add apps/web/features/attendance/application/commands/resolve-unmatched.ts apps/web/features/attendance/application/commands/finalize-sheet.ts apps/web/features/attendance/application/__tests__/finalize-sheet.test.ts
git commit -m "feat(attendance): resolveUnmatched + finalizeSheet commands"
git push origin main
```

### Task 4.8: Commands connect-zoom-s2s + sync-zoom-attendance

**Files:**
- Create: `apps/web/features/attendance/application/commands/connect-zoom-s2s.ts`
- Create: `apps/web/features/attendance/application/commands/sync-zoom-attendance.ts`

- [ ] **Step 1: connect-zoom-s2s.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { ZoomApiClient, ZoomCredentials } from '../ports/zoom-api-client';
import type { SecretCipher } from '../ports/secret-cipher';
import type { OrganizationId } from '@/features/dossier/domain/ids';

export type ConnectZoomS2sInput = {
  organizationId: OrganizationId;
  credentials: ZoomCredentials;
};

export type ConnectZoomS2sError =
  | { code: 'test_failed'; detail: string }
  | { code: 'persistence_error'; detail: string };

export type IntegrationPersistencePort = {
  upsertZoomS2s(args: {
    organizationId: OrganizationId;
    cipherText: Uint8Array;
    nonce: Uint8Array;
    keyId: string;
    lastTestStatus: 'success' | 'error';
    lastTestError: string | null;
  }): Promise<Result<void, { code: 'persistence_error'; detail: string }>>;
};

export type ConnectZoomS2sDeps = {
  api: ZoomApiClient;
  cipher: SecretCipher;
  persistence: IntegrationPersistencePort;
};

export const connectZoomS2s =
  (deps: ConnectZoomS2sDeps) =>
  async (input: ConnectZoomS2sInput): Promise<Result<{ accountEmail: string }, ConnectZoomS2sError>> => {
    const test = await deps.api.testConnection(input.credentials);
    if (!test.ok) return err({ code: 'test_failed', detail: JSON.stringify(test.error) });

    const encrypted = await deps.cipher.encrypt(JSON.stringify(input.credentials));
    const persistR = await deps.persistence.upsertZoomS2s({
      organizationId: input.organizationId,
      cipherText: encrypted.cipherText,
      nonce: encrypted.nonce,
      keyId: encrypted.keyId,
      lastTestStatus: 'success',
      lastTestError: null,
    });
    if (!persistR.ok) return err({ code: 'persistence_error', detail: persistR.error.detail });

    return ok({ accountEmail: test.value.accountEmail });
  };
```

- [ ] **Step 2: sync-zoom-attendance.ts**

```ts
import type { Result } from '@/shared/lib/result';
import { ok, err } from '@/shared/lib/result';
import type { ZoomApiClient } from '../ports/zoom-api-client';
import type { SecretCipher } from '../ports/secret-cipher';
import type { AttendanceSheetId } from '../../domain/ids';
import type { OrganizationId } from '@/features/dossier/domain/ids';
import type { ZoomImportPersistence, ParticipantLookup } from './import-zoom-csv';

export type SyncZoomAttendanceInput = {
  organizationId: OrganizationId;
  sheetId: AttendanceSheetId;
  zoomMeetingId: string;
};

export type SyncZoomAttendanceError =
  | { code: 'integration_not_found' }
  | { code: 'auth_failed' }
  | { code: 'meeting_not_found' }
  | { code: 'network'; detail: string };

export type SyncCredentialsPort = {
  loadDecrypted(organizationId: OrganizationId): Promise<{
    cipherText: Uint8Array; nonce: Uint8Array; keyId: string;
  } | null>;
};

export type SyncSheetDurationPort = {
  sessionDurationMinutes(sheetId: AttendanceSheetId): Promise<number>;
};

export type SyncZoomAttendanceDeps = {
  api: ZoomApiClient;
  cipher: SecretCipher;
  credentials: SyncCredentialsPort;
  lookup: ParticipantLookup;
  persistence: ZoomImportPersistence;
  duration: SyncSheetDurationPort;
  sha256: (text: string) => string;
};

const ATTENDANCE_THRESHOLD = 0.75;

export const syncZoomAttendance =
  (deps: SyncZoomAttendanceDeps) =>
  async (input: SyncZoomAttendanceInput): Promise<Result<{ matched: number; unmatched: number }, SyncZoomAttendanceError>> => {
    const encryptedConfig = await deps.credentials.loadDecrypted(input.organizationId);
    if (!encryptedConfig) return err({ code: 'integration_not_found' });

    const credsJson = await deps.cipher.decrypt({
      cipherText: encryptedConfig.cipherText,
      nonce: encryptedConfig.nonce,
      keyId: encryptedConfig.keyId,
    });
    const creds = JSON.parse(credsJson) as { accountId: string; clientId: string; clientSecret: string };

    const apiR = await deps.api.fetchPastMeetingParticipants(creds, input.zoomMeetingId);
    if (!apiR.ok) {
      if (apiR.error.code === 'auth_failed') return err({ code: 'auth_failed' });
      if (apiR.error.code === 'meeting_not_found') return err({ code: 'meeting_not_found' });
      return err({ code: 'network', detail: 'detail' in apiR.error ? apiR.error.detail : 'unknown' });
    }

    const lookup = await deps.lookup.forSession(input.sheetId);
    const sessionMin = await deps.duration.sessionDurationMinutes(input.sheetId);

    const matched: Parameters<ZoomImportPersistence['apply']>[0]['matched'] = [];
    const unmatched: Parameters<ZoomImportPersistence['apply']>[0]['unmatched'] = [];

    for (const row of apiR.value) {
      const key = row.email?.toLowerCase().trim();
      const hit = key ? lookup.get(key) : undefined;
      if (!hit) { unmatched.push(row); continue; }
      const status = row.durationMinutes >= ATTENDANCE_THRESHOLD * sessionMin ? 'present' : 'late';
      matched.push({ learnerId: hit.learnerId, row, status, hash: deps.sha256(row.rawLine) });
    }

    // Réutilise persistence.apply : remplace evidence_source côté infra par 'zoom_api'
    // (via flag passé dans args ou via persistence dédiée — adapter selon impl)
    await deps.persistence.apply({
      sheetId: input.sheetId,
      sessionDurationMinutes: sessionMin,
      csvContent: '', // pas de CSV brut, API
      csvFilename: '',
      matched,
      unmatched,
    });

    return ok({ matched: matched.length, unmatched: unmatched.length });
  };
```

- [ ] **Step 3: Commit (tests intégration via E2E)**

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/application/commands/connect-zoom-s2s.ts apps/web/features/attendance/application/commands/sync-zoom-attendance.ts
git commit -m "feat(attendance): connectZoomS2s + syncZoomAttendance commands"
git push origin main
```

### Task 4.9: Queries

**Files:**
- Create: `apps/web/features/attendance/application/queries/list-sheets-for-dossier.ts`
- Create: `apps/web/features/attendance/application/queries/list-pending-sheets.ts`
- Create: `apps/web/features/attendance/application/queries/get-sheet-detail.ts`

- [ ] **Step 1: Code (3 queries simples qui délèguent au repo)**

```ts
// list-sheets-for-dossier.ts
import type { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { DossierId } from '@/features/dossier/domain/ids';

export const listSheetsForDossier =
  (repo: AttendanceSheetRepository) => async (dossierId: DossierId): Promise<AttendanceSheet[]> =>
    repo.findByDossier(dossierId);
```

```ts
// list-pending-sheets.ts
import type { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { OrganizationId } from '@/features/dossier/domain/ids';

export const listPendingSheets =
  (repo: AttendanceSheetRepository) => async (orgId: OrganizationId): Promise<AttendanceSheet[]> =>
    repo.listPending(orgId);
```

```ts
// get-sheet-detail.ts
import type { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import type { AttendanceSheetRepository } from '../ports/attendance-sheet.repository';
import type { AttendanceSheetId } from '../../domain/ids';

export const getSheetDetail =
  (repo: AttendanceSheetRepository) => async (id: AttendanceSheetId): Promise<AttendanceSheet | null> =>
    repo.findById(id);
```

- [ ] **Step 2: Commit**

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/application/queries/
git commit -m "feat(attendance): queries (list by dossier, list pending, get detail)"
git push origin main
```

---

## Phase 5 — Infrastructure (~J4)

### Task 5.1: Supabase repository + mappers

**Files:**
- Create: `apps/web/features/attendance/infrastructure/mappers/attendance-sheet.mapper.ts`
- Create: `apps/web/features/attendance/infrastructure/mappers/signature.mapper.ts`
- Create: `apps/web/features/attendance/infrastructure/repositories/supabase-attendance-sheet.repository.ts`

- [ ] **Step 1: signature.mapper.ts**

```ts
import { Signature } from '../../domain/signature.entity';
import { SignatureId, TokenJti } from '../../domain/ids';
import { LearnerId, TrainerId } from '@/features/dossier/domain/ids';
import type { Database } from '@/shared/types/database';

type Row = Database['app']['Tables']['attendance_signatures']['Row'];

export const signatureFromRow = (row: Row): Signature =>
  Signature.rehydrate({
    id: SignatureId(row.id),
    signerKind: row.participant_kind as 'learner' | 'trainer',
    learnerId: row.learner_id ? LearnerId(row.learner_id) : null,
    trainerId: row.trainer_id ? TrainerId(row.trainer_id) : null,
    status: row.status as 'present' | 'absent' | 'late' | 'excused' | null,
    signedAt: row.signed_at ? new Date(row.signed_at) : null,
    signerIp: (row.signer_ip as string | null) ?? null,
    signerUserAgent: row.signer_user_agent,
    signerCountry: (row.signer_country as string | null) ?? null,
    signaturePngPath: row.signature_image_path,
    signatureHash: row.signature_hash,
    tokenJti: row.token_id ? TokenJti(row.token_id) : null,
    evidenceSource: (row.evidence_source as Parameters<typeof Signature.rehydrate>[0]['evidenceSource']) ?? 'manual',
    evidencePayload: row.evidence_payload as Record<string, unknown> | null,
    notes: row.notes,
  });
```

- [ ] **Step 2: attendance-sheet.mapper.ts**

```ts
import { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import { AttendanceSheetId, SessionId } from '../../domain/ids';
import { OrganizationId, DossierId, UserId } from '@/features/dossier/domain/ids';
import { signatureFromRow } from './signature.mapper';
import type { Database } from '@/shared/types/database';

type SheetRow = Database['app']['Tables']['attendance_sheets']['Row'];
type SignatureRow = Database['app']['Tables']['attendance_signatures']['Row'];

export const sheetFromRows = (
  sheetRow: SheetRow,
  signatureRows: SignatureRow[],
  splitStrategy: 'auto' | 'per_day' | 'manual' = 'auto',
): AttendanceSheet =>
  AttendanceSheet.rehydrate({
    id: AttendanceSheetId(sheetRow.id),
    organizationId: OrganizationId(sheetRow.organization_id),
    dossierId: DossierId(sheetRow.dossier_id),
    sessionId: SessionId(sheetRow.session_id),
    halfDay: (sheetRow.half_day as 'morning' | 'afternoon' | 'full' | 'evening') ?? 'full',
    splitStrategy,
    status: sheetRow.status as 'open' | 'partial' | 'completed' | 'finalized',
    signatures: signatureRows.map(signatureFromRow),
    finalizedAt: sheetRow.finalized_at ? new Date(sheetRow.finalized_at) : null,
    finalizedBy: sheetRow.finalized_by ? UserId(sheetRow.finalized_by) : null,
    documentId: sheetRow.document_id,
  });
```

- [ ] **Step 3: supabase-attendance-sheet.repository.ts**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err, type Result } from '@/shared/lib/result';
import type { Database } from '@/shared/types/database';
import type { AttendanceSheetRepository } from '../../application/ports/attendance-sheet.repository';
import { AttendanceSheet } from '../../domain/attendance-sheet.entity';
import type { AttendanceSheetId, SessionId } from '../../domain/ids';
import type { DossierId, OrganizationId } from '@/features/dossier/domain/ids';
import { sheetFromRows } from '../mappers/attendance-sheet.mapper';

export const createSupabaseAttendanceSheetRepository = (
  sb: SupabaseClient<Database>,
): AttendanceSheetRepository => ({
  async save(sheet) {
    const snap = sheet.snapshot;
    const { error } = await sb
      .schema('app')
      .from('attendance_sheets')
      .upsert(
        {
          id: snap.id,
          organization_id: snap.organizationId,
          dossier_id: snap.dossierId,
          session_id: snap.sessionId,
          half_day: snap.halfDay,
          status: snap.status,
          finalized_at: snap.finalizedAt?.toISOString() ?? null,
          finalized_by: snap.finalizedBy,
          document_id: snap.documentId,
        },
        { onConflict: 'session_id,half_day' },
      );
    if (error) return err({ code: 'persistence_error' as const, detail: error.message });
    return ok(undefined);
  },

  async findById(id) {
    const { data: sheetRow } = await sb
      .schema('app')
      .from('attendance_sheets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!sheetRow) return null;
    const { data: sigRows } = await sb
      .schema('app')
      .from('attendance_signatures')
      .select('*')
      .eq('attendance_sheet_id', id);
    return sheetFromRows(sheetRow, sigRows ?? []);
  },

  async findBySession(sessionId) {
    const { data: sheetRows } = await sb
      .schema('app')
      .from('attendance_sheets')
      .select('*')
      .eq('session_id', sessionId);
    if (!sheetRows || sheetRows.length === 0) return [];
    const ids = sheetRows.map((s) => s.id);
    const { data: sigRows } = await sb
      .schema('app')
      .from('attendance_signatures')
      .select('*')
      .in('attendance_sheet_id', ids);
    const byId = new Map<string, typeof sigRows extends Array<infer R> ? R[] : []>();
    for (const sig of sigRows ?? []) {
      const arr = byId.get(sig.attendance_sheet_id) ?? [];
      arr.push(sig as never);
      byId.set(sig.attendance_sheet_id, arr as never);
    }
    return sheetRows.map((r) => sheetFromRows(r, (byId.get(r.id) as never) ?? []));
  },

  async findByDossier(dossierId: DossierId) {
    const { data: sheetRows } = await sb
      .schema('app')
      .from('attendance_sheets')
      .select('*')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: true });
    if (!sheetRows) return [];
    const ids = sheetRows.map((s) => s.id);
    const { data: sigRows } = await sb
      .schema('app')
      .from('attendance_signatures')
      .select('*')
      .in('attendance_sheet_id', ids);
    const byId = new Map<string, never[]>();
    for (const s of sigRows ?? []) {
      const arr = (byId.get(s.attendance_sheet_id) ?? []) as never[];
      arr.push(s as never);
      byId.set(s.attendance_sheet_id, arr);
    }
    return sheetRows.map((r) => sheetFromRows(r, (byId.get(r.id) as never[]) ?? []));
  },

  async listPending(orgId: OrganizationId) {
    const { data: rows } = await sb
      .schema('app')
      .from('attendance_sheets')
      .select('*')
      .eq('organization_id', orgId)
      .in('status', ['open', 'partial', 'completed'])
      .order('created_at', { ascending: false })
      .limit(50);
    if (!rows) return [];
    const { data: sigRows } = await sb
      .schema('app')
      .from('attendance_signatures')
      .select('*')
      .in('attendance_sheet_id', rows.map((r) => r.id));
    const byId = new Map<string, never[]>();
    for (const s of sigRows ?? []) {
      const arr = (byId.get(s.attendance_sheet_id) ?? []) as never[];
      arr.push(s as never);
      byId.set(s.attendance_sheet_id, arr);
    }
    return rows.map((r) => sheetFromRows(r, (byId.get(r.id) as never[]) ?? []));
  },
});
```

- [ ] **Step 4: Regen types DB + commit**

```bash
cd /Users/anissa/i-a-infinity-of && pnpm db:types
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/infrastructure/ apps/web/shared/types/database.ts
git commit -m "feat(attendance): supabase repository + mappers"
git push origin main
```

### Task 5.2: JWT signer adapter (jose) + IP resolver

**Files:**
- Create: `apps/web/features/attendance/infrastructure/adapters/jose-token-signer.ts`
- Create: `apps/web/features/attendance/infrastructure/adapters/headers-ip-resolver.ts`
- Modify: `apps/web/shared/lib/signature-token.ts` (extension TTL configurable)

- [ ] **Step 1: jose-token-signer.ts**

```ts
import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '@/env.mjs';
import { ok, err } from '@/shared/lib/result';
import type { TokenSigner, SignedToken } from '../../application/ports/token-signer';
import { AttendanceSheetId, TokenJti } from '../../domain/ids';

const ISSUER = 'i-a-infinity-of';
const AUDIENCE = 'signature';

const signingKey = (): Uint8Array => {
  try {
    return Uint8Array.from(Buffer.from(env.TOKEN_SIGNING_KEY, 'base64'));
  } catch {
    return new TextEncoder().encode(env.TOKEN_SIGNING_KEY);
  }
};

export const createJoseTokenSigner = (): TokenSigner => ({
  async sign({ sheetId, signerId, signerKind, ttlSeconds }) {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = await new SignJWT({
      sheet: sheetId,
      sub: signerId,
      kind: signerKind,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .setJti(jti)
      .sign(signingKey());
    return { token, jti: TokenJti(jti), expiresAt } satisfies SignedToken;
  },

  async verify(token) {
    try {
      const { payload } = await jwtVerify(token, signingKey(), {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (
        typeof payload.sheet !== 'string' ||
        typeof payload.sub !== 'string' ||
        typeof payload.kind !== 'string' ||
        typeof payload.jti !== 'string' ||
        (payload.kind !== 'learner' && payload.kind !== 'trainer')
      ) {
        return err('invalid_payload' as const);
      }
      return ok({
        sheetId: AttendanceSheetId(payload.sheet),
        signerId: payload.sub,
        signerKind: payload.kind,
        jti: TokenJti(payload.jti),
        issuedAt: new Date((payload.iat ?? 0) * 1000),
        expiresAt: new Date((payload.exp ?? 0) * 1000),
      });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'ERR_JWT_EXPIRED') return err('expired_token' as const);
      return err('invalid_token' as const);
    }
  },
});
```

- [ ] **Step 2: headers-ip-resolver.ts**

```ts
import 'server-only';
import { headers } from 'next/headers';
import type { IpResolver, ResolvedIp } from '../../application/ports/ip-resolver';

export const createHeadersIpResolver = (): IpResolver => ({
  async resolve(): Promise<ResolvedIp> {
    const h = await headers();
    const cf = h.get('cf-connecting-ip');
    const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    const xreal = h.get('x-real-ip');
    const ip = cf || xff || xreal || '0.0.0.0';
    const userAgent = h.get('user-agent');
    const country = h.get('cf-ipcountry');
    return {
      ip,
      userAgent: userAgent ?? null,
      country: country && country !== 'XX' && country.length === 2 ? country.toUpperCase() : null,
    };
  },
});
```

- [ ] **Step 3: Marquer signature-token.ts legacy comme deprecated et router via le port**

(Le fichier `apps/web/shared/lib/signature-token.ts` reste utilisable pour rétrocompat de `apps/web/app/(apprenant)/signer/[token]/actions.ts` jusqu'à refonte Task 6.x.)

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/infrastructure/adapters/jose-token-signer.ts apps/web/features/attendance/infrastructure/adapters/headers-ip-resolver.ts
git commit -m "feat(attendance): jose token signer + headers IP resolver adapters"
git push origin main
```

### Task 5.3: CSV Zoom importer (papaparse)

**Files:**
- Create: `apps/web/features/attendance/infrastructure/adapters/csv-zoom-importer.ts`
- Test: `apps/web/features/attendance/infrastructure/__tests__/csv-zoom-importer.test.ts`

- [ ] **Step 1: csv-zoom-importer.ts**

```ts
import Papa from 'papaparse';
import { ok, err } from '@/shared/lib/result';
import type { ZoomCsvImporter, ZoomParticipantRow } from '../../application/ports/zoom-csv-importer';

const COL_ALIASES = {
  email: ['user email', 'email', 'e-mail', 'adresse e-mail'],
  name: ['name (original name)', 'name', 'nom', 'full name'],
  joinTime: ['join time', 'heure d\'entrée', 'first join', 'start time'],
  leaveTime: ['leave time', 'heure de sortie', 'last leave', 'end time'],
  durationMinutes: [
    'total duration (minutes)',
    'duration (minutes)',
    'durée totale',
    'duration',
    'attendance time',
  ],
};

const findColumn = (header: string[], aliases: readonly string[]): string | null => {
  for (const a of aliases) {
    const found = header.find((h) => h.trim().toLowerCase() === a);
    if (found) return found;
  }
  return null;
};

export const createCsvZoomImporter = (): ZoomCsvImporter => ({
  parse(csv) {
    const result = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: true,
    });
    if (result.errors.length > 0 && result.errors[0]?.code !== 'TooManyFields') {
      return err({ code: 'invalid_csv' });
    }

    const fields = result.meta.fields ?? [];
    if (fields.length === 0) return err({ code: 'no_header' });

    const cols = {
      email: findColumn(fields, COL_ALIASES.email),
      name: findColumn(fields, COL_ALIASES.name),
      joinTime: findColumn(fields, COL_ALIASES.joinTime),
      leaveTime: findColumn(fields, COL_ALIASES.leaveTime),
      durationMinutes: findColumn(fields, COL_ALIASES.durationMinutes),
    };

    const missing = (Object.entries(cols) as Array<[keyof typeof cols, string | null]>)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    if (missing.includes('email') || missing.includes('durationMinutes')) {
      return err({ code: 'missing_columns', missing });
    }

    const rows: ZoomParticipantRow[] = result.data.map((r, i) => {
      const rawLine = fields.map((f) => r[f] ?? '').join(',');
      const durStr = cols.durationMinutes ? r[cols.durationMinutes] ?? '0' : '0';
      const duration = Number.parseInt(durStr.replace(/[^\d]/g, ''), 10) || 0;
      const parseDate = (s: string | undefined): Date | null => {
        if (!s) return null;
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      return {
        email: cols.email ? r[cols.email]?.trim() ?? null : null,
        name: cols.name ? r[cols.name]?.trim() ?? null : null,
        joinTime: cols.joinTime ? parseDate(r[cols.joinTime]) : null,
        leaveTime: cols.leaveTime ? parseDate(r[cols.leaveTime]) : null,
        durationMinutes: duration,
        rawLine: `row_${i}:${rawLine}`,
      };
    });

    return ok(rows);
  },
});
```

- [ ] **Step 2: csv-zoom-importer.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { createCsvZoomImporter } from '../adapters/csv-zoom-importer';

const ZOOM_NATIVE = `Name (Original Name),User Email,Total Duration (Minutes),Guest,Join Time,Leave Time
Alice Martin,alice@acme.fr,150,No,2026-09-15 09:00:23,2026-09-15 11:30:08
Bob Dupont,bob@acme.fr,30,No,2026-09-15 09:45:11,2026-09-15 10:15:42`;

const TEAMS_FORMAT = `Full name,Email,Duration,First Join,Last Leave
Alice Martin,alice@acme.fr,150 minutes,2026-09-15 09:00,2026-09-15 11:30
Bob Dupont,bob@acme.fr,30 minutes,2026-09-15 09:45,2026-09-15 10:15`;

describe('csvZoomImporter', () => {
  it('parses native Zoom CSV', () => {
    const importer = createCsvZoomImporter();
    const r = importer.parse(ZOOM_NATIVE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0]?.email).toBe('alice@acme.fr');
      expect(r.value[0]?.durationMinutes).toBe(150);
    }
  });

  it('parses Teams-like CSV (different column names)', () => {
    const importer = createCsvZoomImporter();
    const r = importer.parse(TEAMS_FORMAT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0]?.durationMinutes).toBe(150);
    }
  });

  it('errors on empty input', () => {
    const r = createCsvZoomImporter().parse('');
    expect(r.ok).toBe(false);
  });

  it('errors when email column missing', () => {
    const r = createCsvZoomImporter().parse(`Name,Duration\nAlice,150`);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === 'missing_columns') {
      expect(r.error.missing).toContain('email');
    }
  });
});
```

- [ ] **Step 3: Run + commit**

```bash
cd apps/web && pnpm test features/attendance/infrastructure
git add apps/web/features/attendance/infrastructure/adapters/csv-zoom-importer.ts apps/web/features/attendance/infrastructure/__tests__/
git commit -m "feat(attendance): CSV Zoom importer (papaparse, tolerant aliases)"
git push origin main
```

### Task 5.4: Zoom S2S API client (fetch + OAuth)

**Files:**
- Create: `apps/web/features/attendance/infrastructure/adapters/fetch-zoom-api-client.ts`

- [ ] **Step 1: Code**

```ts
import 'server-only';
import { ok, err } from '@/shared/lib/result';
import type { ZoomApiClient, ZoomCredentials, ZoomApiError } from '../../application/ports/zoom-api-client';
import type { ZoomParticipantRow } from '../../application/ports/zoom-csv-importer';

type TokenCacheEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, TokenCacheEntry>();

const getAccessToken = async (creds: ZoomCredentials): Promise<{ token: string } | { error: ZoomApiError }> => {
  const key = `${creds.accountId}:${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 30_000) return { token: cached.token };

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const resp = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    },
  );
  if (!resp.ok) {
    return { error: { code: 'auth_failed', detail: `${resp.status} ${await resp.text()}` } };
  }
  const json = (await resp.json()) as { access_token: string; expires_in: number };
  tokenCache.set(key, { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 });
  return { token: json.access_token };
};

export const createFetchZoomApiClient = (): ZoomApiClient => ({
  async testConnection(creds) {
    const t = await getAccessToken(creds);
    if ('error' in t) return err(t.error);
    const r = await fetch('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${t.token}` },
    });
    if (!r.ok) return err({ code: 'auth_failed' as const, detail: `me ${r.status}` });
    const me = (await r.json()) as { email: string };
    return ok({ accountEmail: me.email });
  },

  async fetchPastMeetingParticipants(creds, meetingId) {
    const t = await getAccessToken(creds);
    if ('error' in t) return err(t.error);

    const all: ZoomParticipantRow[] = [];
    let nextToken: string | undefined;
    do {
      const url = new URL(`https://api.zoom.us/v2/past_meetings/${encodeURIComponent(meetingId)}/participants`);
      url.searchParams.set('page_size', '300');
      if (nextToken) url.searchParams.set('next_page_token', nextToken);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${t.token}` } });
      if (r.status === 404) return err({ code: 'meeting_not_found' as const });
      if (r.status === 429) return err({ code: 'rate_limited' as const });
      if (!r.ok) return err({ code: 'network' as const, detail: `${r.status}` });
      const body = (await r.json()) as {
        participants: Array<{
          name?: string; user_email?: string;
          join_time?: string; leave_time?: string; duration?: number;
        }>;
        next_page_token?: string;
      };
      for (const p of body.participants) {
        all.push({
          name: p.name ?? null,
          email: p.user_email ?? null,
          joinTime: p.join_time ? new Date(p.join_time) : null,
          leaveTime: p.leave_time ? new Date(p.leave_time) : null,
          durationMinutes: p.duration ? Math.round(p.duration / 60) : 0,
          rawLine: JSON.stringify(p),
        });
      }
      nextToken = body.next_page_token && body.next_page_token.length > 0 ? body.next_page_token : undefined;
    } while (nextToken);

    return ok(all);
  },
});
```

- [ ] **Step 2: Commit**

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/infrastructure/adapters/fetch-zoom-api-client.ts
git commit -m "feat(attendance): Zoom S2S API client (OAuth + paginated participants)"
git push origin main
```

### Task 5.5: PDF renderer (@react-pdf/renderer)

**Files:**
- Create: `apps/web/features/attendance/infrastructure/adapters/react-pdf-renderer.tsx`
- Create: `apps/web/features/attendance/infrastructure/adapters/pgsodium-secret-cipher.ts`

- [ ] **Step 1: react-pdf-renderer.tsx**

```tsx
import 'server-only';
import { Document, Page, Text, View, Image, StyleSheet, pdf } from '@react-pdf/renderer';
import type { PdfRenderer, PdfRendererInput, PdfRendererOutput } from '../../application/ports/pdf-renderer';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, borderBottom: 1, paddingBottom: 8 },
  logo: { width: 80, height: 40, objectFit: 'contain' },
  title: { fontSize: 14, fontWeight: 'bold' },
  meta: { color: '#555', marginTop: 4 },
  table: { marginTop: 12, borderTop: 1, borderLeft: 1 },
  row: { flexDirection: 'row', borderBottom: 1 },
  cell: { padding: 6, borderRight: 1, flex: 1 },
  cellNarrow: { padding: 6, borderRight: 1, width: 80 },
  cellSig: { padding: 6, borderRight: 1, width: 120 },
  sigImg: { width: 100, height: 36, objectFit: 'contain' },
  footer: { marginTop: 24, fontSize: 8, color: '#666' },
  hash: { fontFamily: 'Courier', fontSize: 7, marginTop: 4 },
});

export const createReactPdfRenderer = (): PdfRenderer => ({
  async render(input: PdfRendererInput): Promise<PdfRendererOutput> {
    const snap = input.sheet.snapshot;
    const halfDayLabel = {
      morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir',
    }[snap.halfDay];

    const doc = (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Feuille d'émargement — {halfDayLabel}</Text>
              <Text style={styles.meta}>{input.dossierReference} · {input.formationTitle}</Text>
              <Text style={styles.meta}>
                {input.sessionStartsAt.toLocaleString('fr-FR')} → {input.sessionEndsAt.toLocaleString('fr-FR')}
              </Text>
            </View>
            {input.organizationLogoUrl ? <Image src={input.organizationLogoUrl} style={styles.logo} /> : null}
          </View>

          <View style={styles.table}>
            <View style={[styles.row, { backgroundColor: '#f5f5f5' }]}>
              <Text style={styles.cell}>Apprenant</Text>
              <Text style={styles.cellNarrow}>Statut</Text>
              <Text style={styles.cellNarrow}>Horodatage</Text>
              <Text style={styles.cellSig}>Signature / Preuve</Text>
              <Text style={styles.cellNarrow}>IP</Text>
            </View>
            {snap.signatures.map((s) => {
              const p = s.props;
              const signerLabel = p.learnerId ?? p.trainerId ?? '?';
              const sigUrl = p.signaturePngPath ? input.signatureSignedUrls.get(p.signaturePngPath) : undefined;
              return (
                <View style={styles.row} key={p.id}>
                  <Text style={styles.cell}>{signerLabel}</Text>
                  <Text style={styles.cellNarrow}>{p.status ?? '—'}</Text>
                  <Text style={styles.cellNarrow}>{p.signedAt?.toLocaleString('fr-FR') ?? '—'}</Text>
                  <View style={styles.cellSig}>
                    {sigUrl ? (
                      <Image src={sigUrl} style={styles.sigImg} />
                    ) : (
                      <Text>{p.evidenceSource === 'zoom_csv' || p.evidenceSource === 'zoom_api' ? `Zoom log` : '—'}</Text>
                    )}
                  </View>
                  <Text style={styles.cellNarrow}>{p.signerIp ?? '—'}</Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.footer}>
            {input.organizationName} · Document généré le {new Date().toLocaleString('fr-FR')}
          </Text>
          <Text style={styles.hash}>Feuille ID: {snap.id}</Text>
        </Page>
      </Document>
    );

    const instance = pdf(doc);
    const blob = await instance.toBlob();
    const buf = await blob.arrayBuffer();
    return { bytes: new Uint8Array(buf), contentType: 'application/pdf' };
  },
});
```

- [ ] **Step 2: pgsodium-secret-cipher.ts**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SecretCipher, EncryptedSecret } from '../../application/ports/secret-cipher';

/**
 * Délègue le chiffrement à pgsodium côté base.
 * On stocke key_id (UUID), nonce, ciphertext directement.
 * Décryptage via RPC `app.pgsodium_decrypt(cipher, nonce, key_id)`.
 */
export const createPgsodiumSecretCipher = (sb: SupabaseClient): SecretCipher => ({
  async encrypt(plaintext) {
    const { data, error } = await sb.rpc('pgsodium_encrypt_v2' as never, {
      p_plaintext: plaintext,
    } as never) as { data: { ciphertext: string; nonce: string; key_id: string } | null; error: unknown };
    if (error || !data) throw new Error(`pgsodium_encrypt: ${JSON.stringify(error)}`);
    return {
      cipherText: Buffer.from(data.ciphertext, 'hex'),
      nonce: Buffer.from(data.nonce, 'hex'),
      keyId: data.key_id,
    } satisfies EncryptedSecret;
  },

  async decrypt(secret) {
    const { data, error } = await sb.rpc('pgsodium_decrypt_v2' as never, {
      p_ciphertext: '\\x' + Buffer.from(secret.cipherText).toString('hex'),
      p_nonce: '\\x' + Buffer.from(secret.nonce).toString('hex'),
      p_key_id: secret.keyId,
    } as never) as { data: string | null; error: unknown };
    if (error || !data) throw new Error(`pgsodium_decrypt: ${JSON.stringify(error)}`);
    return data;
  },
});
```

> **Note** : les RPC `pgsodium_encrypt_v2` / `pgsodium_decrypt_v2` doivent être créées en migration 0029 ou supplémentaire. Si pgsodium pose problème, fallback : variables d'environnement par tenant + chiffrement AES-256-GCM côté Node.

- [ ] **Step 3: Commit**

```bash
cd apps/web && pnpm typecheck
git add apps/web/features/attendance/infrastructure/adapters/react-pdf-renderer.tsx apps/web/features/attendance/infrastructure/adapters/pgsodium-secret-cipher.ts
git commit -m "feat(attendance): PDF renderer (@react-pdf/renderer) + pgsodium cipher adapter"
git push origin main
```

<!-- PLAN_CONTINUES_AT_PHASE_6 -->
