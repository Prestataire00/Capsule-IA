# Slice 1 — Fondation signature/cachet + persistance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un OF de régler une fois sa signature + son cachet, puis voir tous ses documents générés (convention, attestation, facture) auto-signés et tracés dans `app.documents`, sans ressaisie et cohérents avec le CRM.

**Architecture:** Approche A (inline dans les routes GET existantes). On ajoute (1) le stockage signature/cachet/représentant sur `app.organizations` + un bucket privé `org_assets` org-scopé, (2) une couche d'apposition pdf-lib partagée, (3) un helper de persistance idempotent content-addressed vers `app.documents`, puis on branche les 3 générateurs existants. Aucun nouvel agrégat domain.

**Tech Stack:** Postgres (migration + RLS + pgTAP), Supabase Storage, Next.js 14 Server Actions (`authActionClient` + Zod), pdf-lib, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-06-12-documents-signature-persistance-design.md`

---

## File Structure

**Créés :**
- `supabase/migrations/0045_org_signature_and_document_persistence.sql` — colonnes org + bucket `org_assets` + RLS + index idempotence.
- `supabase/tests/0049_test_org_assets_rls.sql` — pgTAP isolation `org_assets`.
- `supabase/tests/0050_test_documents_persist.sql` — pgTAP unicité hash + insert documents par rôle.
- `apps/web/features/documents/file-hash.ts` — `sha256Hex(bytes)` **pur** (testé).
- `apps/web/features/documents/file-hash.test.ts`
- `apps/web/features/documents/persist-document.ts` — helper de persistance idempotent.
- `apps/web/features/documents/persist-document.test.ts` — vitest (sb mocké).
- `apps/web/features/documents/apply-org-signature.ts` — couche d'apposition pdf-lib.
- `apps/web/features/documents/apply-org-signature.test.ts` — vitest.
- `apps/web/features/documents/load-org-branding.ts` — fetch org repr. + download signature/cachet (réutilisé par les 3 routes).
- `apps/web/app/(dashboard)/parametres/organisation/branding-schema.ts` — Zod partagé.
- `apps/web/app/(dashboard)/parametres/organisation/branding-actions.ts` — Server Actions.
- `apps/web/app/(dashboard)/parametres/organisation/signature-stamp-section.tsx` — section UI client.

**Modifiés :**
- `apps/web/features/documents/generate-convention-pdf.ts` — `Input` + appel apposition.
- `apps/web/features/documents/generate-attestation-pdf.ts` — `Input` + appel apposition.
- `apps/web/features/documents/generate-invoice-pdf.ts` — `Input` + appel apposition.
- `apps/web/app/api/dossiers/[id]/convention.pdf/route.ts` — charge branding + persiste.
- `apps/web/app/api/dossiers/[id]/attestation.pdf/route.ts` — charge branding + persiste.
- `apps/web/app/api/invoices/[id]/facture.pdf/route.ts` — charge branding + persiste.
- `apps/web/app/(dashboard)/parametres/organisation/page.tsx` — monte la section UI.

---

## Faits de codebase à connaître

- Helpers RLS (migration 0018) : `app.current_organization_id()` (UUID de la claim JWT), `app.is_org_member(org)`, `app.is_admin_or_owner()`, `app.is_staff()`.
- Storage RLS : utiliser `(storage.foldername(name))[1]` pour le 1ᵉʳ segment du path (= `organization_id`). Pattern bucket existant : `supabase/migrations/0038_documents_bucket.sql`, `0032_zoom_integration.sql`.
- `app.documents` colonnes : `id, organization_id, dossier_id, template_id, kind, title, status app.document_status, storage_path, mime_type, file_size_bytes, file_hash, version, generation_input JSONB, generated_at, created_by, deleted_at`. `document_status ∈ pending|generating|ready|failed|archived`.
- `app.organizations` : `name, legal_name, siret, declaration_activite, address JSONB, logo_path` (on ajoute representative_name/title, signature_path, stamp_path).
- Server Action : `authActionClient.schema(Z).action(async ({ parsedInput, ctx }) => { ... ctx.supabase ... })` — `ctx.supabase` est le client RLS-scoped. Réf : `apps/web/app/(formateur)/profil/actions.ts`.
- Générateurs : `pdf-lib`. Le cadre signature de l'attestation est ancré à `x = MARGIN + COL - 240`, `y = c.y - 90`, largeur 240, hauteur 90 (`MARGIN=48`, `COL = 595.28 - 96`). Les 3 générateurs partagent ce style (A4, MARGIN 48, helpers `drawText`).
- Numérotation : migrations vont jusqu'à `0042` sur `main` ; la branche `feature/emargement-consolide-zoom` (PR #1) réserve `0043`/`0044` et les tests `0047`/`0048`. D'où `0045` (migration) et `0049`/`0050` (tests) ici.
- Commandes : `pnpm db:reset`, `pnpm db:test`, `pnpm db:types`, `pnpm --filter web test <pattern>`. ⚠️ `db:*` exigent Docker/Supabase local (souvent indisponible → write-only).

---

## Task 1 : Migration 0045 — colonnes org + bucket org_assets + RLS + index

**Files:** Create `supabase/migrations/0045_org_signature_and_document_persistence.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- ============================================================================
-- 0045 — Signature/cachet de l'organisme + persistance documentaire
-- ============================================================================

-- 1) Représentant + assets signature sur l'organisation
ALTER TABLE app.organizations
  ADD COLUMN IF NOT EXISTS representative_name  TEXT,
  ADD COLUMN IF NOT EXISTS representative_title TEXT,
  ADD COLUMN IF NOT EXISTS signature_path       TEXT,
  ADD COLUMN IF NOT EXISTS stamp_path           TEXT;

-- 2) Bucket privé pour les images de signature/cachet (PNG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org_assets', 'org_assets', false,
  2097152, -- 2 MB
  ARRAY['image/png']
)
ON CONFLICT (id) DO NOTHING;

-- 3) RLS org_assets : un membre n'accède qu'aux objets de SON organisation
--    (1er segment du path = organization_id). Écriture réservée admin/owner.
CREATE POLICY "org_assets_member_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
  );

CREATE POLICY "org_assets_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

CREATE POLICY "org_assets_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

CREATE POLICY "org_assets_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org_assets'
    AND (storage.foldername(name))[1] = app.current_organization_id()::text
    AND app.is_admin_or_owner()
  );

-- 4) Idempotence content-addressed des documents générés
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_org_filehash
  ON app.documents (organization_id, file_hash)
  WHERE file_hash IS NOT NULL AND deleted_at IS NULL;
```

- [ ] **Step 2 : Replay local (Docker requis ; sinon write-only → PENDING)**

Run : `pnpm db:reset`
Expected : succès ; `\d app.organizations` montre les 4 nouvelles colonnes ; bucket `org_assets` présent.
> Si Docker est down : ne pas lancer, marquer PENDING.

- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/0045_org_signature_and_document_persistence.sql
git commit -m "feat(documents): colonnes signature org + bucket org_assets + index idempotence"
```

---

## Task 2 : pgTAP — isolation org_assets

**Files:** Create `supabase/tests/0049_test_org_assets_rls.sql`

- [ ] **Step 1 : Écrire le test**

```sql
-- ============================================================================
-- Tests pgTAP : RLS bucket org_assets (isolation cross-tenant + write admin)
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');

INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'g@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test'),
  ('gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Gest A', 'g@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true),
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire'::app.member_role, true);

-- Un objet org_assets appartenant à l'org A
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('org_assets', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa/signature.png', NULL);

-- Owner de A authentifié : voit l'objet de A
SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM storage.objects
     WHERE bucket_id = 'org_assets' AND name LIKE '00aaa000-%'),
  1, 'Owner de A voit l''asset de A');

-- Un membre de B ne voit pas l'asset de A
SELECT tests.clear_jwt();
SELECT tests.set_jwt('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT is(
  (SELECT count(*)::int FROM storage.objects
     WHERE bucket_id = 'org_assets'),
  0, 'Un membre de B ne voit aucun asset de A');

-- Un gestionnaire (non admin/owner) de A ne peut pas INSERT
SELECT tests.clear_jwt();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'gestionnaire', 'gest-0a0a-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('org_assets', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa/stamp.png') $$,
  '42501',
  NULL,
  'Un gestionnaire ne peut pas écrire un asset org (admin/owner only)');

SELECT tests.clear_jwt();
SELECT * FROM finish();
ROLLBACK;
```

> Note : si une colonne NOT NULL de `storage.objects` manque dans les INSERT (selon la version de Supabase local), compléter en lisant la table. La logique de test reste inchangée.

- [ ] **Step 2 : Lancer** — `pnpm db:test` (PENDING si Docker down). Expected : 3 assertions passent.
- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/0049_test_org_assets_rls.sql
git commit -m "test(documents): pgTAP isolation cross-tenant du bucket org_assets"
```

---

## Task 3 : pgTAP — unicité hash + insert documents

**Files:** Create `supabase/tests/0050_test_documents_persist.sql`

- [ ] **Step 1 : Écrire le test**

```sql
-- ============================================================================
-- Tests pgTAP : index d'idempotence (organization_id, file_hash) sur documents
-- ============================================================================
BEGIN;
SELECT plan(2);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, status) VALUES
  ('d0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-A', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'draft');

-- 1er insert d'un document avec un hash donné : OK
INSERT INTO app.documents (organization_id, dossier_id, kind, title, status, storage_path, mime_type, file_hash, generated_at)
VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'convention', 'Convention', 'ready', 'documents/x.pdf', 'application/pdf', 'HASH123', now());
SELECT is(
  (SELECT count(*)::int FROM app.documents WHERE file_hash = 'HASH123'),
  1, 'Premier document inséré');

-- 2e insert même (org, hash) : violation d'unicité
SELECT throws_ok(
  $$ INSERT INTO app.documents (organization_id, dossier_id, kind, title, status, storage_path, mime_type, file_hash, generated_at)
     VALUES ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'convention', 'Convention', 'ready', 'documents/y.pdf', 'application/pdf', 'HASH123', now()) $$,
  '23505',
  NULL,
  'Un doublon (org, file_hash) est rejeté par l''index unique');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2 : Lancer** — `pnpm db:test` (PENDING si Docker down). Expected : 2 assertions passent.
- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/0050_test_documents_persist.sql
git commit -m "test(documents): pgTAP unicité (organization_id, file_hash)"
```

---

## Task 4 : Helper pur `sha256Hex` (TDD Vitest)

**Files:** Create `apps/web/features/documents/file-hash.ts` + `apps/web/features/documents/file-hash.test.ts`

- [ ] **Step 1 : Test (échoue d'abord)**

```ts
import { describe, it, expect } from 'vitest';
import { sha256Hex } from './file-hash';

describe('sha256Hex', () => {
  it('hash connu pour une entrée vide', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('déterministe et sensible au contenu', () => {
    const a = sha256Hex(new TextEncoder().encode('hello'));
    const b = sha256Hex(new TextEncoder().encode('hello'));
    const c = sha256Hex(new TextEncoder().encode('world'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test file-hash` → FAIL (module non trouvé).
- [ ] **Step 3 : Implémenter**

```ts
import 'server-only';
import { createHash } from 'node:crypto';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test file-hash` → PASS.
- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/documents/file-hash.ts apps/web/features/documents/file-hash.test.ts
git commit -m "feat(documents): helper pur sha256Hex"
```

---

## Task 5 : Helper de persistance `persist-document.ts` (TDD Vitest)

**Files:** Create `apps/web/features/documents/persist-document.ts` + `apps/web/features/documents/persist-document.test.ts`

- [ ] **Step 1 : Test (sb mocké) — échoue d'abord**

```ts
import { describe, it, expect, vi } from 'vitest';
import { persistGeneratedDocument } from './persist-document';

function makeSb(existing: { id: string } | null) {
  const insert = vi.fn().mockResolvedValue({ data: { id: 'doc-new' }, error: null });
  const upload = vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null });
  const sb = {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({ maybeSingle: () => Promise.resolve({ data: existing, error: null }) }),
            }),
          }),
        }),
        insert: () => ({ select: () => ({ single: () => insert() } ) }),
      }),
    }),
    storage: { from: () => ({ upload }) },
  };
  return { sb, insert, upload };
}

describe('persistGeneratedDocument', () => {
  const args = {
    organizationId: 'org1', dossierId: 'dos1', kind: 'convention',
    title: 'Convention', bytes: new TextEncoder().encode('pdf'), generationInput: { a: 1 },
  };

  it('insère un document quand le hash est nouveau', async () => {
    const { sb, insert, upload } = makeSb(null);
    const r = await persistGeneratedDocument(sb as never, args);
    expect(r.created).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it('no-op idempotent quand le hash existe déjà', async () => {
    const { sb, insert, upload } = makeSb({ id: 'doc-existing' });
    const r = await persistGeneratedDocument(sb as never, args);
    expect(r).toEqual({ documentId: 'doc-existing', created: false });
    expect(upload).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test persist-document` → FAIL.
- [ ] **Step 3 : Implémenter**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from './file-hash';

export type PersistArgs = {
  organizationId: string;
  dossierId: string | null;
  kind: string;
  title: string;
  bytes: Uint8Array;
  generationInput: unknown;
};

export async function persistGeneratedDocument(
  sb: SupabaseClient,
  args: PersistArgs,
): Promise<{ documentId: string; created: boolean }> {
  const fileHash = sha256Hex(args.bytes);

  const { data: existing } = await sb
    .schema('app')
    .from('documents')
    .select('id')
    .eq('organization_id', args.organizationId)
    .eq('file_hash', fileHash)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing) {
    return { documentId: (existing as { id: string }).id, created: false };
  }

  const storagePath = `${args.organizationId}/${args.dossierId ?? 'org'}/${args.kind}/${fileHash}.pdf`;
  const { error: upErr } = await sb.storage
    .from('documents')
    .upload(storagePath, args.bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`document_upload_failed: ${upErr.message}`);

  const { data: inserted, error: insErr } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: args.organizationId,
      dossier_id: args.dossierId,
      kind: args.kind,
      title: args.title,
      status: 'ready',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size_bytes: args.bytes.byteLength,
      file_hash: fileHash,
      generated_at: new Date().toISOString(),
      generation_input: args.generationInput,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`document_insert_failed: ${insErr.message}`);

  return { documentId: (inserted as { id: string }).id, created: true };
}
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test persist-document` → PASS (2 tests).
- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/documents/persist-document.ts apps/web/features/documents/persist-document.test.ts
git commit -m "feat(documents): helper de persistance idempotent (content-addressed)"
```

---

## Task 6 : Couche d'apposition `apply-org-signature.ts` (TDD Vitest)

**Files:** Create `apps/web/features/documents/apply-org-signature.ts` + `apps/web/features/documents/apply-org-signature.test.ts`

- [ ] **Step 1 : Test — échoue d'abord**

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { drawSignatureBlock, type SignatureAssets } from './apply-org-signature';

async function setup() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, fonts: { font, fontBold } };
}

const anchor = { x: 300, y: 200, width: 240, height: 90 };

describe('drawSignatureBlock', () => {
  it('ne jette pas et embarque 0 image quand les assets sont null', async () => {
    const { doc, page, fonts } = await setup();
    const assets: SignatureAssets = {
      signaturePng: null, stampPng: null,
      representativeName: 'Marie OF', representativeTitle: 'Gérante',
      place: 'Lyon', date: new Date('2026-06-12T00:00:00Z'),
    };
    await expect(drawSignatureBlock(doc, page, fonts, anchor, assets)).resolves.toBeUndefined();
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('embarque la signature quand un PNG valide est fourni', async () => {
    const { doc, page, fonts } = await setup();
    // PNG 1x1 transparent (base64)
    const png1x1 = Uint8Array.from(atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    ), (c) => c.charCodeAt(0));
    const assets: SignatureAssets = {
      signaturePng: png1x1, stampPng: png1x1,
      representativeName: 'Marie OF', representativeTitle: 'Gérante',
      place: 'Lyon', date: new Date('2026-06-12T00:00:00Z'),
    };
    await expect(drawSignatureBlock(doc, page, fonts, anchor, assets)).resolves.toBeUndefined();
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test apply-org-signature` → FAIL.
- [ ] **Step 3 : Implémenter**

```ts
import 'server-only';
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

export type SignatureAssets = {
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  representativeName: string | null;
  representativeTitle: string | null;
  place: string | null;
  date: Date;
};

export type SignatureAnchor = { x: number; y: number; width: number; height: number };

const COLOR_BODY = rgb(0.094, 0.094, 0.106);
const COLOR_MUTED = rgb(0.42, 0.42, 0.45);

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
}

export async function drawSignatureBlock(
  doc: PDFDocument,
  page: PDFPage,
  fonts: { font: PDFFont; fontBold: PDFFont },
  anchor: SignatureAnchor,
  assets: SignatureAssets,
): Promise<void> {
  const { x, y, width, height } = anchor;

  // Légende "Fait à ..., le ..."
  const place = assets.place?.trim();
  const caption = place ? `Fait à ${place}, le ${fmtDate(assets.date)}` : `Fait le ${fmtDate(assets.date)}`;
  page.drawText(caption, { x, y: y + height + 8, size: 9, font: fonts.font, color: COLOR_BODY });

  // Cadre
  page.drawText("Signature et cachet de l'organisme", {
    x: x + 6, y: y + height - 12, size: 8, font: fonts.fontBold, color: COLOR_MUTED,
  });

  // Cachet en fond (à droite), puis signature par-dessus (à gauche)
  if (assets.stampPng) {
    const stamp = await doc.embedPng(assets.stampPng);
    const s = stamp.scaleToFit(72, 72);
    page.drawImage(stamp, { x: x + width - s.width - 8, y: y + 8, width: s.width, height: s.height, opacity: 0.85 });
  }
  if (assets.signaturePng) {
    const sig = await doc.embedPng(assets.signaturePng);
    const s = sig.scaleToFit(110, 48);
    page.drawImage(sig, { x: x + 8, y: y + 16, width: s.width, height: s.height });
  }

  // Nom + qualité du représentant
  const repLine = [assets.representativeName, assets.representativeTitle].filter(Boolean).join(' — ');
  if (repLine) {
    page.drawText(repLine, { x: x + 6, y: y + 4, size: 8, font: fonts.font, color: COLOR_BODY });
  }
}
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test apply-org-signature` → PASS (2 tests).
- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/documents/apply-org-signature.ts apps/web/features/documents/apply-org-signature.test.ts
git commit -m "feat(documents): couche d'apposition signature/cachet pdf-lib"
```

---

## Task 7 : Chargeur de branding `load-org-branding.ts`

**Files:** Create `apps/web/features/documents/load-org-branding.ts`

- [ ] **Step 1 : Implémenter**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgBranding = {
  representativeName: string | null;
  representativeTitle: string | null;
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
};

async function downloadPng(sb: SupabaseClient, path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await sb.storage.from('org_assets').download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function loadOrgBranding(
  sb: SupabaseClient,
  organizationId: string,
): Promise<OrgBranding> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('representative_name, representative_title, signature_path, stamp_path')
    .eq('id', organizationId)
    .maybeSingle();
  const row = (data ?? {}) as {
    representative_name?: string | null;
    representative_title?: string | null;
    signature_path?: string | null;
    stamp_path?: string | null;
  };
  return {
    representativeName: row.representative_name ?? null,
    representativeTitle: row.representative_title ?? null,
    signaturePng: await downloadPng(sb, row.signature_path ?? null),
    stampPng: await downloadPng(sb, row.stamp_path ?? null),
  };
}
```

- [ ] **Step 2 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep load-org-branding` → seule erreur tolérée : `@/env.mjs` pré-existant si importé (ici aucun import env → attendu vide).
- [ ] **Step 3 : Commit**

```bash
git add apps/web/features/documents/load-org-branding.ts
git commit -m "feat(documents): chargeur de branding org (représentant + signature/cachet)"
```

---

## Task 8 : Réglages org — schéma Zod + Server Actions

**Files:** Create `apps/web/app/(dashboard)/parametres/organisation/branding-schema.ts` + `branding-actions.ts`

- [ ] **Step 1 : Schéma Zod partagé**

```ts
import { z } from 'zod';

export const OrgRepresentativeSchema = z.object({
  representativeName: z.string().trim().max(120).nullable(),
  representativeTitle: z.string().trim().max(120).nullable(),
});
export type OrgRepresentativeInput = z.infer<typeof OrgRepresentativeSchema>;

// Upload : le fichier est envoyé en base64 (data URL décodée côté action).
export const OrgAssetUploadSchema = z.object({
  kind: z.enum(['signature', 'stamp']),
  pngBase64: z.string().min(1),
});
export type OrgAssetUploadInput = z.infer<typeof OrgAssetUploadSchema>;
```

- [ ] **Step 2 : Server Actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { OrgRepresentativeSchema, OrgAssetUploadSchema } from './branding-schema';

export const updateOrgRepresentativeAction = authActionClient
  .schema(OrgRepresentativeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = ctx.organizationId;
    const { error } = await ctx.supabase
      .schema('app')
      .from('organizations')
      .update({
        representative_name: parsedInput.representativeName,
        representative_title: parsedInput.representativeTitle,
      })
      .eq('id', orgId);
    if (error) throw new Error(`update_representative_failed: ${error.message}`);
    revalidatePath('/parametres/organisation');
    return { ok: true };
  });

export const uploadOrgAssetAction = authActionClient
  .schema(OrgAssetUploadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const orgId = ctx.organizationId;
    const path = `${orgId}/${parsedInput.kind}.png`;
    const bytes = Uint8Array.from(Buffer.from(parsedInput.pngBase64, 'base64'));
    const { error: upErr } = await ctx.supabase.storage
      .from('org_assets')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });
    if (upErr) throw new Error(`upload_asset_failed: ${upErr.message}`);
    const column = parsedInput.kind === 'signature' ? 'signature_path' : 'stamp_path';
    const { error: updErr } = await ctx.supabase
      .schema('app')
      .from('organizations')
      .update({ [column]: path })
      .eq('id', orgId);
    if (updErr) throw new Error(`update_asset_path_failed: ${updErr.message}`);
    revalidatePath('/parametres/organisation');
    return { ok: true, path };
  });
```

> Vérifier le nom exact du contexte d'org dans `@/shared/lib/safe-action` (probablement `ctx.organizationId`). Si le champ s'appelle autrement (ex. `ctx.orgId`/`ctx.session.organizationId`), aligner ces deux usages dessus en lisant `safe-action.ts`.

- [ ] **Step 3 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep "parametres/organisation/branding"` → corriger toute erreur introduite (hors `@/env.mjs`).
- [ ] **Step 4 : Commit**

```bash
git add "apps/web/app/(dashboard)/parametres/organisation/branding-schema.ts" \
        "apps/web/app/(dashboard)/parametres/organisation/branding-actions.ts"
git commit -m "feat(parametres): schéma + actions signature/cachet org"
```

---

## Task 9 : Réglages org — section UI

**Files:** Create `apps/web/app/(dashboard)/parametres/organisation/signature-stamp-section.tsx` ; Modify `apps/web/app/(dashboard)/parametres/organisation/page.tsx`

- [ ] **Step 1 : Lire la page existante** pour connaître ses props (org courante, comment elle charge les données) et son style.

Run : `sed -n '1,80p' "apps/web/app/(dashboard)/parametres/organisation/page.tsx"`

- [ ] **Step 2 : Section client `signature-stamp-section.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { UploadCloud, Check } from 'lucide-react';
import { updateOrgRepresentativeAction, uploadOrgAssetAction } from './branding-actions';

export function SignatureStampSection(props: {
  representativeName: string | null;
  representativeTitle: string | null;
  hasSignature: boolean;
  hasStamp: boolean;
}) {
  const [name, setName] = useState(props.representativeName ?? '');
  const [title, setTitle] = useState(props.representativeTitle ?? '');
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const saveRep = () =>
    start(async () => {
      await updateOrgRepresentativeAction({
        representativeName: name || null,
        representativeTitle: title || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  const upload = (kind: 'signature' | 'stamp') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? '';
      start(async () => {
        await uploadOrgAssetAction({ kind, pngBase64: base64 });
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Signature & cachet</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
          Apposés automatiquement sur tous les documents générés (convention, attestation, facture).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[13px] text-zinc-700 dark:text-zinc-300">
          Nom du représentant
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px]" />
        </label>
        <label className="text-[13px] text-zinc-700 dark:text-zinc-300">
          Qualité
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px]" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['signature', 'stamp'] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950">
            <UploadCloud className="w-4 h-4 text-zinc-400" />
            <span>{kind === 'signature' ? 'Signature' : 'Cachet'} (PNG)
              {((kind === 'signature' && props.hasSignature) || (kind === 'stamp' && props.hasStamp)) && (
                <Check className="inline w-3.5 h-3.5 text-emerald-500 ml-1" />
              )}
            </span>
            <input type="file" accept="image/png" className="hidden" onChange={upload(kind)} disabled={pending} />
          </label>
        ))}
      </div>

      <button type="button" onClick={saveRep} disabled={pending}
        className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition disabled:opacity-50">
        {saved ? 'Enregistré' : 'Enregistrer le représentant'}
      </button>
    </section>
  );
}
```

- [ ] **Step 3 : Monter la section dans `page.tsx`** — importer `SignatureStampSection` et la rendre en passant `representativeName`, `representativeTitle`, `hasSignature={!!org.signature_path}`, `hasStamp={!!org.stamp_path}` depuis les données org déjà chargées par la page (ajouter ces colonnes au `select` de la page si besoin).

- [ ] **Step 4 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "organisation/(page|signature-stamp)"` → corriger toute nouvelle erreur (hors `@/env.mjs`).
- [ ] **Step 5 : Commit**

```bash
git add "apps/web/app/(dashboard)/parametres/organisation/signature-stamp-section.tsx" \
        "apps/web/app/(dashboard)/parametres/organisation/page.tsx"
git commit -m "feat(parametres): section UI signature/cachet org"
```

---

## Task 10 : Brancher les 3 générateurs + routes (signature + persistance)

> Pour chaque générateur, on ajoute à son `Input` les champs `signaturePng: Uint8Array | null`, `stampPng: Uint8Array | null`, `representativeTitle: string | null`, `place: string | null`, et on remplace le dessin manuel du cadre signature par un appel à `drawSignatureBlock` à l'ancre existante. Dans chaque route, on charge le branding via `loadOrgBranding` et on persiste via `persistGeneratedDocument`.

### 10a — Attestation (le plus simple, ancre déjà identifiée)

- [ ] **Step 1 : Lire** `apps/web/features/documents/generate-attestation-pdf.ts` (bloc "Cadre signature", ancre `x = MARGIN + COL - 240`, `y = c.y - 90`, w 240, h 90).
- [ ] **Step 2 : Modifier `AttestationInput`** — ajouter `signaturePng`, `stampPng`, `representativeTitle`, `place` (à côté de `organization.representativeName`). Importer `drawSignatureBlock`. Remplacer le bloc "Cadre signature" manuel par :

```ts
  // Cadre signature auto (signature + cachet OF apposés)
  const sigAnchor = { x: MARGIN + COL - 240, y: c.y - 90, width: 240, height: 90 };
  await drawSignatureBlock(doc, c.page, { font, fontBold }, sigAnchor, {
    signaturePng: input.signaturePng,
    stampPng: input.stampPng,
    representativeName: input.organization.representativeName,
    representativeTitle: input.representativeTitle,
    place: input.place,
    date: input.generatedAt,
  });
```

(la fonction `generate*` doit être `async` et `return doc.save()` reste en fin ; elle l'est déjà.)

- [ ] **Step 3 : Modifier la route** `apps/web/app/api/dossiers/[id]/attestation.pdf/route.ts` :
  - importer `loadOrgBranding` et `persistGeneratedDocument` ;
  - après avoir l'`organization_id`, `const branding = await loadOrgBranding(sb, orgId);` ;
  - passer `signaturePng: branding.signaturePng, stampPng: branding.stampPng, representativeTitle: branding.representativeTitle, place: <ville depuis org.address>` dans l'`Input` (utiliser `branding.representativeName` si la route ne le fournissait pas déjà) ;
  - après `const bytes = await generateAttestationPDF(input);`, ajouter (best-effort, log sans bloquer) :

```ts
  try {
    await persistGeneratedDocument(sb, {
      organizationId: orgId,
      dossierId: params.id,
      kind: 'attestation_fin',
      title: 'Attestation de fin de formation',
      bytes,
      generationInput: input,
    });
  } catch (e) {
    console.error('[attestation] persist failed', e);
  }
```

- [ ] **Step 4 : Typecheck delta** — `... | grep -E "attestation"` → seules erreurs tolérées : `@/env.mjs`.
- [ ] **Step 5 : Commit** — `git commit -m "feat(documents): attestation auto-signée + persistée"`.

### 10b — Convention

- [ ] **Step 1 : Lire** `generate-convention-pdf.ts` pour localiser son cadre/zone signature et son ancre exacte.
- [ ] **Step 2 : Mêmes modifications** que 10a (Input + `drawSignatureBlock` à l'ancre de la convention).
- [ ] **Step 3 : Route** `convention.pdf/route.ts` — `loadOrgBranding` + persist `kind: 'convention'`, `title: 'Convention de formation'`, `dossierId: params.id`.
- [ ] **Step 4 : Typecheck delta** — `... | grep convention`.
- [ ] **Step 5 : Commit** — `git commit -m "feat(documents): convention auto-signée + persistée"`.

### 10c — Facture

- [ ] **Step 1 : Lire** `generate-invoice-pdf.ts` (zone signature ; certaines factures n'ont pas de cadre — si absent, ajouter une ancre en bas à droite cohérente avec le style).
- [ ] **Step 2 : Mêmes modifications** (Input + `drawSignatureBlock`).
- [ ] **Step 3 : Route** `facture.pdf/route.ts` — `loadOrgBranding` + persist `kind: 'facture'`, `title: 'Facture <reference>'`, `dossierId: <invoice.dossier_id>` (peut être null → persistance tolère null).
- [ ] **Step 4 : Typecheck delta** — `... | grep -E "facture|invoice"`.
- [ ] **Step 5 : Commit** — `git commit -m "feat(documents): facture auto-signée + persistée"`.

---

## Task 11 : Vérification finale

- [ ] **Step 1 : Suite TS** — `pnpm --filter web test` → tous verts (dont file-hash, persist-document, apply-org-signature). Confirmer aucune **nouvelle** erreur `tsc` attribuable à la feature (hors `@/env.mjs` pré-existant) : `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "features/documents|parametres/organisation" | grep -v env.mjs`.
- [ ] **Step 2 : DB (si Docker dispo)** — `pnpm db:reset && pnpm db:test && pnpm db:types` → migrations rejouées, pgTAP 0049/0050 verts, `database.ts` régénéré (commit le diff). Sinon : PENDING documenté.
- [ ] **Step 3 : Golden path manuel** — Paramètres → uploader signature + cachet PNG + représentant → télécharger l'attestation d'un dossier → la signature+cachet sont apposés ; vérifier une ligne `status=ready` dans `app.documents` ; re-télécharger → pas de doublon (même hash).
- [ ] **Step 4 : Commit final si ajustements** — `git commit -am "chore(documents): finalisation slice 1"`.

---

## Self-Review

**1. Couverture spec :** §5 migration → T1. §11 pgTAP (org_assets + hash) → T2+T3. §8 persistance → T4+T5. §7 apposition → T6. §6 réglages (schéma/actions/UI) → T8+T9. §9 branchement routes → T10. §6/§9 chargement branding → T7. §11 golden path → T11. Aucune section sans tâche.

**2. Placeholders :** les seuls renvois "lire le fichier" concernent l'édition de fichiers existants (générateurs convention/facture, page paramètres, `safe-action`) dont les coordonnées/champs exacts doivent être lus avant édition — accompagnés du code à appliquer. Pas de TBD dans les composants neufs.

**3. Cohérence des types :** `sha256Hex(Uint8Array): string` (T4) consommé par `persistGeneratedDocument` (T5) et `drawSignatureBlock(doc, page, fonts, anchor, assets)` (T6) appelé à l'identique en T10. `SignatureAssets`/`SignatureAnchor` définis en T6, utilisés en T10. `loadOrgBranding(sb, orgId): OrgBranding` (T7) → champs `signaturePng/stampPng/representativeName/representativeTitle` réutilisés en T10. `PersistArgs.kind` = string aligné sur l'enum `document_templates.kind` (`convention`/`attestation_fin`/`facture`).

**Risque résiduel connu :** le nom du champ d'org dans le contexte `authActionClient` (`ctx.organizationId` supposé) est à confirmer dans `@/shared/lib/safe-action` (T8 le signale). Les ancres signature de convention/facture sont à lire (T10b/10c) — l'attestation sert de modèle exact.
