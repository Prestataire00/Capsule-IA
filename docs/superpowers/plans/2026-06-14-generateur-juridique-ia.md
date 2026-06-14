# Générateur juridique assisté IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Générer les documents juridiques niveau organisme (RI, CGV, livret d'accueil) avec Claude, ancrés sur les textes officiels Légifrance, avec relecture/validation humaine et rendu PDF brandé.

**Architecture:** Module Légifrance (OAuth PISTE → texte exact des articles) → génération Claude (`claude-opus-4-8`, adaptive thinking, ancrée sur les extraits fournis) → brouillon éditable en base (`org_legal_documents`) → validation humaine → PDF brandé (pipeline pdf-lib existant). Première intégration IA du repo.

**Tech Stack:** Postgres/Supabase (migration + RLS + pgTAP), Next.js 14 (Server Actions, Server Component), `@anthropic-ai/sdk`, Légifrance/PISTE REST, pdf-lib, Vitest.

---

## Référence SDK Claude (via skill claude-api — à respecter)

- Projet TypeScript → SDK **`@anthropic-ai/sdk`** (`npm i @anthropic-ai/sdk`).
- Modèle : **`claude-opus-4-8`** (qualité juridique).
- **Pas de `temperature`/`top_p`** sur Opus 4.8 (retirés → 400). Steering **par le prompt** uniquement.
- Réflexion : `thinking: { type: "adaptive" }` + `output_config: { effort: "high" }`.
- Sortie potentiellement longue → **streaming** + `stream.finalMessage()`.
- Client : `new Anthropic()` lit `ANTHROPIC_API_KEY` ; renvoyer `null` si absente (comme `resend.ts`).

## Conventions repo (vérifiées)

- `env.mjs` = `z.object({...})` simple ; vars serveur optionnelles via `.optional()`.
- Pipeline PDF existant : `generate-convention-pdf.ts` (pdf-lib), `apply-org-signature.ts` (`drawSignatureBlock`), `load-org-branding.ts`, `persist-document.ts`. Bucket `documents`.
- `document_templates.kind` CHECK : ajouter `'cgv'` (RI/livret déjà présents).
- Helper RLS : `app.current_organization_id()`.
- **Migrations** : dernière = `0062` → ce plan utilise **`0063`**. ⚠️ `main` avance (sessions parallèles) ; `git pull --rebase` + renuméroter au prochain libre avant merge.
- Web : `pnpm test` (Vitest), `pnpm lint`, `pnpm build`. DB : staging `gxmsspevjqirfacvhxul` via API (Docker absent) ; CI valide la chaîne.

> **⚠️ Vérif partielle** : `ANTHROPIC_API_KEY` + `LEGIFRANCE_CLIENT_ID/SECRET` requis pour les appels live → **vérif end-to-end PENDING** sans ces clés (comme Resend). Sont vérifiables : migration (staging/CI), `buildLegalPrompt` (Vitest pur), build/lint. Les modules réseau renvoient une erreur lisible si la clé manque.

## File Structure

**Migration (créer)**
- `supabase/migrations/0063_org_legal_documents.sql` — kind `cgv` + table `org_legal_documents` + RLS.

**Test pgTAP (créer)**
- `supabase/tests/0063_test_org_legal_documents.sql`.

**App (créer)**
- `apps/web/shared/lib/legifrance/client.ts` — OAuth PISTE + `fetchArticle`.
- `apps/web/shared/lib/legifrance/mapping.ts` — articles par kind (pur).
- `apps/web/shared/lib/ai/client.ts` — instance Anthropic (null si pas de clé).
- `apps/web/shared/lib/ai/build-legal-prompt.ts` — builder de prompt (pur, testé).
- `apps/web/shared/lib/ai/generate-legal-doc.ts` — appel Claude (server-only).
- `apps/web/shared/lib/ai/__tests__/build-legal-prompt.test.ts` — Vitest.
- `apps/web/features/documents/generate-legal-doc-pdf.ts` — rendu PDF.
- `apps/web/app/(dashboard)/parametres/documents-legaux/actions.ts` — 3 server actions.
- `apps/web/app/(dashboard)/parametres/documents-legaux/page.tsx` — UI.

**App (modifier)**
- `apps/web/env.mjs` — 3 vars optionnelles.
- `apps/web/package.json` — dépendance `@anthropic-ai/sdk`.

---

### Task 1: Migration — table + kind CGV + RLS

**Files:**
- Create: `supabase/migrations/0063_org_legal_documents.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0063 — Documents juridiques niveau organisme (générés par IA, validés)
-- ============================================================================

ALTER TABLE app.document_templates DROP CONSTRAINT IF EXISTS document_templates_kind_check;
ALTER TABLE app.document_templates ADD CONSTRAINT document_templates_kind_check
  CHECK (kind IN (
    'convention', 'convocation', 'programme', 'attestation_presence',
    'attestation_fin', 'certificat_realisation', 'reglement_interieur',
    'livret_accueil', 'devis', 'facture', 'feuille_emargement',
    'questionnaire', 'convention_collective', 'cgv', 'autre'
  ));

CREATE TABLE app.org_legal_documents (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reglement_interieur','cgv','livret_accueil')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated')),
  content_md TEXT,
  sources_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_model TEXT,
  generated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,
  pdf_storage_path TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind)
);

ALTER TABLE app.org_legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_legal_documents_rw ON app.org_legal_documents
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
```

- [ ] **Step 2: Vérif (staging via API ou CI)** : table créée, kind `cgv` accepté.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0063_org_legal_documents.sql
git commit -m "feat(juridique): table org_legal_documents + kind cgv + RLS"
```

---

### Task 2: pgTAP

**Files:**
- Create: `supabase/tests/0063_test_org_legal_documents.sql`

- [ ] **Step 1: Écrire le test**

```sql
BEGIN;
SELECT plan(3);
\i supabase/tests/_helpers.sql

SELECT tests.create_test_org('11111111-1111-1111-1111-111111111111', 'Org A');
SELECT tests.create_test_org('22222222-2222-2222-2222-222222222222', 'Org B');

INSERT INTO app.org_legal_documents (organization_id, kind, status, content_md)
VALUES ('11111111-1111-1111-1111-111111111111', 'reglement_interieur', 'draft', 'RI...');

-- 1) Insert OK.
SELECT is((SELECT count(*)::int FROM app.org_legal_documents
  WHERE organization_id='11111111-1111-1111-1111-111111111111'), 1, 'doc créé');

-- 2) Transition vers validated.
UPDATE app.org_legal_documents SET status='validated', validated_at=now()
WHERE organization_id='11111111-1111-1111-1111-111111111111' AND kind='reglement_interieur';
SELECT is((SELECT status FROM app.org_legal_documents
  WHERE organization_id='11111111-1111-1111-1111-111111111111' AND kind='reglement_interieur'),
  'validated', 'transition draft->validated');

-- 3) RLS : org B ne voit pas les docs de org A.
SELECT tests.authenticate_as('22222222-2222-2222-2222-222222222222');
SELECT is((SELECT count(*)::int FROM app.org_legal_documents
  WHERE organization_id='11111111-1111-1111-1111-111111111111'), 0,
  'RLS : org B ne voit pas org A');

SELECT * FROM finish();
ROLLBACK;
```

> Adapter aux helpers réels de `_helpers.sql`.

- [ ] **Step 2: Vérif** : `pnpm db:test` (CI) — 3 assertions vertes.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0063_test_org_legal_documents.sql
git commit -m "test(juridique): pgTAP org_legal_documents (statut + RLS)"
```

---

### Task 3: Dépendance + env

**Files:**
- Modify: `apps/web/package.json`, `apps/web/env.mjs`

- [ ] **Step 1: Ajouter le SDK**

Run: `cd apps/web && pnpm add @anthropic-ai/sdk`
Expected: dépendance ajoutée (lockfile mis à jour).

- [ ] **Step 2: Ajouter les vars env (optionnelles)**

Dans `apps/web/env.mjs`, dans `z.object({...})` après `RESEND_API_KEY` :

```js
  ANTHROPIC_API_KEY: z.string().optional(),
  LEGIFRANCE_CLIENT_ID: z.string().optional(),
  LEGIFRANCE_CLIENT_SECRET: z.string().optional(),
```

Et ajouter les 3 dans le bloc `runtimeEnv`/process.env mapping s'il existe (vérifier la fin du fichier).

- [ ] **Step 3: Vérif + commit**

Run: `pnpm typecheck` (pas de nouvelle erreur attribuable) ; `git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/env.mjs && git commit -m "chore(juridique): @anthropic-ai/sdk + env IA/Légifrance"`

---

### Task 4: Mapping légal (module pur) + test

**Files:**
- Create: `apps/web/shared/lib/legifrance/mapping.ts`
- Create: `apps/web/shared/lib/ai/build-legal-prompt.ts`
- Create: `apps/web/shared/lib/ai/__tests__/build-legal-prompt.test.ts`

- [ ] **Step 1: Mapping (pur)**

```ts
// apps/web/shared/lib/legifrance/mapping.ts
// Articles officiels à récupérer par type de document.
export type LegalKind = 'reglement_interieur' | 'cgv' | 'livret_accueil';

export type ArticleRef = { code: string; numero: string };

// Code du travail : règlement intérieur des stagiaires de la formation pro.
const RI_ARTICLES: ArticleRef[] = [
  { code: 'LEGITEXT000006072050', numero: 'L6352-3' },
  { code: 'LEGITEXT000006072050', numero: 'L6352-4' },
  { code: 'LEGITEXT000006072050', numero: 'L6352-5' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-1' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-2' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-3' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-4' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-5' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-6' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-7' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-8' },
];

export function articlesFor(kind: LegalKind): ArticleRef[] {
  switch (kind) {
    case 'reglement_interieur': return RI_ARTICLES;
    case 'cgv': return [{ code: 'LEGITEXT000006072050', numero: 'L6353-1' }];
    case 'livret_accueil': return [{ code: 'LEGITEXT000006072050', numero: 'L6353-8' }];
  }
}
```

> ⚠️ Les `code`/`numero` Légifrance sont à confirmer côté PISTE (l'ID `LEGITEXT...` du Code du travail + les numéros). À ajuster à l'intégration réelle ; la structure reste.

- [ ] **Step 2: Test du builder de prompt (Vitest)**

```ts
// apps/web/shared/lib/ai/__tests__/build-legal-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildLegalPrompt } from '../build-legal-prompt';

describe('buildLegalPrompt', () => {
  const sources = [{ ref: 'R6352-1', texte: 'Le règlement intérieur est établi…' }];
  const org = { name: 'Acme OF', nda: '11 75 12345 75' };

  it('inclut les extraits légaux fournis', () => {
    const p = buildLegalPrompt('reglement_interieur', org, sources);
    expect(p).toContain('R6352-1');
    expect(p).toContain('Le règlement intérieur est établi');
    expect(p).toContain('Acme OF');
  });

  it('interdit explicitement d’inventer des sources', () => {
    const p = buildLegalPrompt('cgv', org, sources);
    expect(p.toLowerCase()).toContain('uniquement');
    expect(p).toContain('CGV'.length ? 'cgv' : '');
  });
});
```

- [ ] **Step 3: Lancer (échoue)** : `pnpm test build-legal-prompt` → FAIL (module absent).

- [ ] **Step 4: Implémenter le builder (pur)**

```ts
// apps/web/shared/lib/ai/build-legal-prompt.ts
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

export type LegalSource = { ref: string; texte: string };
export type OrgInfo = { name: string; nda?: string | null; address?: string | null; representative?: string | null };

const KIND_LABEL: Record<LegalKind, string> = {
  reglement_interieur: "règlement intérieur des stagiaires",
  cgv: "conditions générales de vente (cgv)",
  livret_accueil: "livret d'accueil du stagiaire",
};

// Prompt ancré : Claude rédige UNIQUEMENT à partir des extraits fournis.
export function buildLegalPrompt(kind: LegalKind, org: OrgInfo, sources: LegalSource[]): string {
  const extraits = sources.map((s) => `### Article ${s.ref}\n${s.texte}`).join('\n\n');
  return [
    `Tu rédiges le ${KIND_LABEL[kind]} d'un organisme de formation français, conforme Qualiopi.`,
    `Organisme : ${org.name}${org.nda ? ` (déclaration d'activité ${org.nda})` : ''}.`,
    org.address ? `Adresse : ${org.address}.` : '',
    org.representative ? `Représentant : ${org.representative}.` : '',
    '',
    `Tu dois t'appuyer UNIQUEMENT sur les extraits légaux officiels ci-dessous.`,
    `N'invente AUCUN article ni référence. Cite les numéros d'articles tels que fournis.`,
    `Signale entre crochets [À COMPLÉTER PAR L'OF : …] tout élément manquant.`,
    `Rends le document en Markdown structuré (titres, articles numérotés).`,
    '',
    `## Extraits légaux officiels (Légifrance)`,
    extraits,
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 5: Vérifier** : `pnpm test build-legal-prompt` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/shared/lib/legifrance/mapping.ts apps/web/shared/lib/ai/build-legal-prompt.ts apps/web/shared/lib/ai/__tests__/build-legal-prompt.test.ts
git commit -m "feat(juridique): mapping légal + builder de prompt ancré (TDD)"
```

---

### Task 5: Client Légifrance (PISTE)

**Files:**
- Create: `apps/web/shared/lib/legifrance/client.ts`

- [ ] **Step 1: Implémenter le client**

```ts
// apps/web/shared/lib/legifrance/client.ts
import 'server-only';
import { env } from '@/env.mjs';
import type { ArticleRef } from './mapping';

const OAUTH_URL = 'https://oauth.piste.gouv.fr/api/oauth/token';
const API_BASE = 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app';

let _token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!env.LEGIFRANCE_CLIENT_ID || !env.LEGIFRANCE_CLIENT_SECRET) return null;
  if (_token && _token.expiresAt > Date.now() + 30_000) return _token.value;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.LEGIFRANCE_CLIENT_ID,
    client_secret: env.LEGIFRANCE_CLIENT_SECRET,
    scope: 'openid',
  });
  const res = await fetch(OAUTH_URL, { method: 'POST', body });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _token.value;
}

export type FetchedArticle = { ref: string; texte: string };

// Récupère le texte d'un article. Renvoie null si pas de clés / échec (l'appelant gère).
export async function fetchArticle(a: ArticleRef): Promise<FetchedArticle | null> {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/consult/getArticle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: a.numero }),
  });
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const texte: string = json?.article?.texte ?? json?.article?.texteHtml ?? '';
  return texte ? { ref: a.numero, texte } : null;
}
```

> ⚠️ La forme exacte de la requête `getArticle` (champ `id` vs `{code, numero}`) dépend de l'API PISTE — à ajuster avec la doc PISTE réelle à l'intégration (clé requise). La structure (OAuth client_credentials + cache token + fetch) est correcte.

- [ ] **Step 2: Vérif** : `pnpm lint apps/web/shared/lib/legifrance/client.ts` ; pas d'appel live sans clés.

- [ ] **Step 3: Commit**

```bash
git add apps/web/shared/lib/legifrance/client.ts
git commit -m "feat(juridique): client Légifrance/PISTE (OAuth + fetchArticle)"
```

---

### Task 6: Client + génération Claude

**Files:**
- Create: `apps/web/shared/lib/ai/client.ts`, `apps/web/shared/lib/ai/generate-legal-doc.ts`

- [ ] **Step 1: Client Anthropic (null si pas de clé)**

```ts
// apps/web/shared/lib/ai/client.ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/env.mjs';

let _client: Anthropic | null = null;
export function anthropic(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  _client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

export const LEGAL_MODEL = 'claude-opus-4-8';
```

- [ ] **Step 2: Génération (server-only, streaming + finalMessage)**

```ts
// apps/web/shared/lib/ai/generate-legal-doc.ts
import 'server-only';
import { anthropic, LEGAL_MODEL } from './client';
import { buildLegalPrompt, type OrgInfo, type LegalSource } from './build-legal-prompt';
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

export type GenerateResult =
  | { ok: true; contentMd: string; model: string }
  | { ok: false; reason: 'no_api_key' | 'generation_failed'; error?: unknown };

export async function generateLegalDoc(
  kind: LegalKind, org: OrgInfo, sources: LegalSource[],
): Promise<GenerateResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };
  const prompt = buildLegalPrompt(kind, org, sources);
  try {
    // Opus 4.8 : adaptive thinking + effort high ; PAS de temperature. Streaming (sortie longue).
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
    });
    const msg = await stream.finalMessage();
    const contentMd = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');
    if (!contentMd.trim()) return { ok: false, reason: 'generation_failed' };
    return { ok: true, contentMd, model: LEGAL_MODEL };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', error };
  }
}
```

> `output_config` cast en `any` si les types du SDK installé ne l'exposent pas encore ; le champ est accepté par l'API. Vérifier la version du SDK ; sinon retirer le cast.

- [ ] **Step 3: Vérif** : `pnpm lint` (fichiers) ; `pnpm build` (compile).

- [ ] **Step 4: Commit**

```bash
git add apps/web/shared/lib/ai/client.ts apps/web/shared/lib/ai/generate-legal-doc.ts
git commit -m "feat(juridique): client Anthropic + génération doc juridique (Opus 4.8)"
```

---

### Task 7: PDF + Server Actions

**Files:**
- Create: `apps/web/features/documents/generate-legal-doc-pdf.ts`
- Create: `apps/web/app/(dashboard)/parametres/documents-legaux/actions.ts`

- [ ] **Step 1: Lire le pipeline existant pour réutiliser branding/persist**

Run: `sed -n '1,40p' apps/web/features/documents/generate-convention-pdf.ts; sed -n '1,30p' apps/web/features/documents/persist-document.ts; sed -n '1,30p' apps/web/features/documents/load-org-branding.ts`
Expected: signatures de `drawSignatureBlock`, `persistGeneratedDocument`, `loadOrgBranding` à réutiliser.

- [ ] **Step 2: Générateur PDF (markdown → PDF brandé)**

```ts
// apps/web/features/documents/generate-legal-doc-pdf.ts
import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type LegalPdfInput = {
  title: string;
  organization: { name: string; nda: string | null; address: string | null };
  contentMd: string;
};

// Rendu simple : titre + en-tête OF + corps markdown (lignes) sur pages A4.
export async function generateLegalDocPDF(input: LegalPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 50;
  const size = 595.28; // A4 width
  const height = 841.89;
  let page = pdf.addPage([size, height]);
  let y = height - margin;

  const line = (text: string, f = font, fs = 10) => {
    if (y < margin + 20) { page = pdf.addPage([size, height]); y = height - margin; }
    page.drawText(text, { x: margin, y, size: fs, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= fs + 4;
  };

  line(input.organization.name, bold, 14);
  if (input.organization.nda) line(`Déclaration d'activité : ${input.organization.nda}`, font, 9);
  if (input.organization.address) line(input.organization.address, font, 9);
  y -= 10;
  line(input.title, bold, 16);
  y -= 6;

  for (const raw of input.contentMd.split('\n')) {
    const t = raw.replace(/[*_`]/g, '');
    if (t.startsWith('### ')) { line(t.slice(4), bold, 11); }
    else if (t.startsWith('## ')) { line(t.slice(3), bold, 12); }
    else if (t.startsWith('# ')) { line(t.slice(2), bold, 13); }
    else if (t.trim() === '') { y -= 6; }
    else {
      // wrap grossier à ~95 caractères
      for (let i = 0; i < t.length; i += 95) line(t.slice(i, i + 95));
    }
  }
  return pdf.save();
}
```

- [ ] **Step 3: Server Actions**

```ts
// apps/web/app/(dashboard)/parametres/documents-legaux/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { articlesFor, type LegalKind } from '@/shared/lib/legifrance/mapping';
import { fetchArticle } from '@/shared/lib/legifrance/client';
import { generateLegalDoc } from '@/shared/lib/ai/generate-legal-doc';
import { generateLegalDocPDF } from '@/features/documents/generate-legal-doc-pdf';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

const KIND_TITLE: Record<LegalKind, string> = {
  reglement_interieur: 'Règlement intérieur',
  cgv: 'Conditions générales de vente',
  livret_accueil: "Livret d'accueil",
};

async function orgInfo(sb: ReturnType<typeof admin>, orgId: string) {
  const { data } = await sb.schema('app').from('organizations')
    .select('name, declaration_activite').eq('id', orgId).maybeSingle();
  const o = (data ?? {}) as { name?: string; declaration_activite?: string };
  return { name: o.name ?? '', nda: o.declaration_activite ?? null };
}

export async function generateLegalDocDraft(orgId: string, kind: LegalKind): Promise<ActionResult> {
  const sb = admin();
  // 1. Sources légales
  const refs = articlesFor(kind);
  const fetched = await Promise.all(refs.map((r) => fetchArticle(r)));
  const sources = fetched.filter((x): x is NonNullable<typeof x> => x !== null);
  if (sources.length === 0) return { ok: false, error: 'Légifrance indisponible (clés PISTE ?)' };

  // 2. Génération Claude
  const org = await orgInfo(sb, orgId);
  const gen = await generateLegalDoc(kind, org, sources);
  if (!gen.ok) return { ok: false, error: gen.reason === 'no_api_key' ? 'Clé Anthropic manquante' : 'Génération échouée' };

  // 3. Upsert brouillon
  const { error } = await sb.schema('app').from('org_legal_documents').upsert({
    organization_id: orgId, kind, status: 'draft', content_md: gen.contentMd,
    sources_used: sources, generated_model: gen.model, generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,kind' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/parametres/documents-legaux');
  return { ok: true };
}

export async function saveLegalDocEdit(orgId: string, kind: LegalKind, contentMd: string): Promise<ActionResult> {
  const sb = admin();
  const { error } = await sb.schema('app').from('org_legal_documents')
    .update({ content_md: contentMd, status: 'draft', updated_at: new Date().toISOString() })
    .eq('organization_id', orgId).eq('kind', kind);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/parametres/documents-legaux');
  return { ok: true };
}

export async function validateLegalDoc(orgId: string, kind: LegalKind): Promise<ActionResult> {
  const sb = admin();
  const { data: doc } = await sb.schema('app').from('org_legal_documents')
    .select('content_md, version').eq('organization_id', orgId).eq('kind', kind).maybeSingle();
  const d = doc as { content_md?: string; version?: number } | null;
  if (!d?.content_md) return { ok: false, error: 'Brouillon vide' };

  const org = await orgInfo(sb, orgId);
  const pdf = await generateLegalDocPDF({
    title: KIND_TITLE[kind],
    organization: { name: org.name, nda: org.nda, address: null },
    contentMd: d.content_md,
  });
  const path = `${orgId}/legal/${kind}-v${(d.version ?? 1)}.pdf`;
  const up = await sb.storage.from('documents').upload(path, Buffer.from(pdf), {
    contentType: 'application/pdf', upsert: true,
  });
  if (up.error) return { ok: false, error: up.error.message };

  const { error } = await sb.schema('app').from('org_legal_documents').update({
    status: 'validated', validated_at: new Date().toISOString(),
    pdf_storage_path: path, version: (d.version ?? 1) + 1, updated_at: new Date().toISOString(),
  }).eq('organization_id', orgId).eq('kind', kind);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/parametres/documents-legaux');
  return { ok: true };
}
```

> **Vérifs** : colonne org `declaration_activite` (vu en 0027) ; `validated_by` laissé null (service-role) ou résoudre l'user via session — V1 accepte null. PDF brandé minimal (sans logo/signature) ; enrichir via `loadOrgBranding`/`drawSignatureBlock` en V2.

- [ ] **Step 4: Vérif + commit**

Run: `pnpm lint <fichiers> && pnpm build`
```bash
git add apps/web/features/documents/generate-legal-doc-pdf.ts "apps/web/app/(dashboard)/parametres/documents-legaux/actions.ts"
git commit -m "feat(juridique): rendu PDF + server actions (brouillon/édition/validation)"
```

---

### Task 8: UI — page documents légaux

**Files:**
- Create: `apps/web/app/(dashboard)/parametres/documents-legaux/page.tsx`

- [ ] **Step 1: Page (Server Component, prod-safe)**

```tsx
// ARCHETYPE: workflow
// Justification: génération IA + validation des documents juridiques de l'OF.

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { generateLegalDocDraft, saveLegalDocEdit, validateLegalDoc } from './actions';
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

const DOCS: { kind: LegalKind; label: string }[] = [
  { kind: 'reglement_interieur', label: 'Règlement intérieur' },
  { kind: 'cgv', label: 'Conditions générales de vente' },
  { kind: 'livret_accueil', label: "Livret d'accueil" },
];

export default async function DocumentsLegauxPage() {
  const sb = supabaseServer();
  const { data: org } = await sb.schema('app').from('organizations').select('id').limit(1).maybeSingle();
  const orgId = (org as { id?: string } | null)?.id ?? '';

  const { data: docs } = await sb.schema('app').from('org_legal_documents')
    .select('kind, status, content_md, sources_used, generated_model, validated_at, pdf_storage_path')
    .eq('organization_id', orgId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byKind = new Map<string, any>(((docs as any[]) ?? []).map((d) => [d.kind, d]));

  return (
    <div className="space-y-8">
      <header>
        <SectionLabel>Documents juridiques (assistés par IA)</SectionLabel>
        <p className="text-[12px] text-zinc-500 mt-1">
          Génération à partir des sources officielles (Légifrance) — <strong>aide à la rédaction, pas un conseil juridique</strong> : relisez et validez avant usage.
        </p>
      </header>

      {DOCS.map(({ kind, label }) => {
        const d = byKind.get(kind);
        const sources = (d?.sources_used as Array<{ ref: string }> | undefined) ?? [];
        return (
          <section key={kind} className="rounded-lg border border-zinc-200/60 dark:border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[14px]">{label}</h3>
              <span className="text-[11px] text-zinc-500">
                {d ? (d.status === 'validated' ? `Validé le ${new Date(d.validated_at).toLocaleDateString('fr-FR')}` : 'Brouillon') : 'Non généré'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <form action={async () => { 'use server'; await generateLegalDocDraft(orgId, kind); }}>
                <button type="submit" className="border border-zinc-200/60 dark:border-zinc-800 text-[12px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition">
                  {d ? 'Régénérer (IA)' : 'Générer (IA)'}
                </button>
              </form>
              {d?.status === 'draft' && (
                <form action={async () => { 'use server'; await validateLegalDoc(orgId, kind); }}>
                  <button type="submit" className="bg-orange-500 text-white text-[12px] px-3 py-1.5 rounded-md hover:bg-orange-600 transition">Valider</button>
                </form>
              )}
              {d?.pdf_storage_path && <span className="text-[11px] text-emerald-600 self-center">PDF généré</span>}
            </div>

            {d?.content_md && (
              <form action={async (fd: FormData) => { 'use server'; await saveLegalDocEdit(orgId, kind, String(fd.get('content') ?? '')); }} className="space-y-2">
                <textarea name="content" defaultValue={d.content_md} rows={10}
                  className="w-full text-[12px] font-mono border border-zinc-200/60 dark:border-zinc-800 rounded p-2 bg-transparent" />
                <button type="submit" className="border border-zinc-200/60 dark:border-zinc-800 text-[12px] px-3 py-1 rounded-md">Enregistrer les modifications</button>
              </form>
            )}

            {sources.length > 0 && (
              <p className="text-[11px] text-zinc-500">Sources citées : {sources.map((s) => s.ref).join(', ')}{d?.generated_model ? ` · ${d.generated_model}` : ''}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

> Vérifs : `supabaseServer()`/`params` ; ici l'org est résolue par `limit(1)` faute de contexte org dans la page paramètres — remplacer par la vraie résolution d'org de la session si disponible. Prod-safe : tables/colonnes manquantes → `data` null → section « Non généré ».

- [ ] **Step 2: Vérif** : `pnpm lint <page> && pnpm build`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/parametres/documents-legaux/page.tsx"
git commit -m "feat(juridique): page documents légaux (générer / éditer / valider)"
```

---

### Task 9: Vérification finale

- [ ] **Step 1: Suite** : `pnpm test` (build-legal-prompt vert) + `pnpm lint` + `pnpm build` OK ; CI exécute `db:test` (pgTAP 0063).
- [ ] **Step 2: Vérif fonctionnelle (env avec clés)** : configurer `ANTHROPIC_API_KEY` + `LEGIFRANCE_CLIENT_ID/SECRET`, ouvrir `/parametres/documents-legaux`, Générer le RI → brouillon avec articles cités → éditer → Valider → PDF dans le bucket.
- [ ] **Step 3: Régénérer types** (API Management depuis staging) si besoin, commit.

---

## Self-Review

**Spec coverage :**
- Kind `cgv` + table `org_legal_documents` + RLS → Task 1, testé Task 2.
- Légifrance/PISTE (OAuth + articles) → Task 5, mapping Task 4.
- Génération Claude ancrée (`claude-opus-4-8`, adaptive, **sans temperature**) → Task 6, prompt Task 4 (testé).
- Flux brouillon → édition → validation + PDF + traçabilité (sources/model/validated_at/version) → Task 7.
- UI générer/éditer/valider + sources citées + disclaimer → Task 8.
- Dépendances (SDK + env) → Task 3.

**Cohérence noms :** `LegalKind` (reglement_interieur|cgv|livret_accueil) Tasks 4/6/7/8 ; `buildLegalPrompt(kind,org,sources)` Tasks 4/6 ; `generateLegalDoc → {ok,contentMd,model}` Tasks 6/7 ; `org_legal_documents` colonnes Tasks 1/7/8 ; `articlesFor`/`fetchArticle` Tasks 4/5/7.

**À confirmer à l'exécution (signalés inline) :** IDs/numéros Légifrance + forme requête PISTE (clés requises) ; champ `output_config` dans les types du SDK installé ; résolution d'org dans la page paramètres ; colonne `declaration_activite` ; helpers pgTAP ; numérotation migration vs main.

**Dépendances/PENDING :** `ANTHROPIC_API_KEY` + clés PISTE pour la vérif end-to-end (comme Resend). DB + prompt-builder + build vérifiables sans.

**Hors scope (V2) :** sous-système A (programme/certificat) ; PDF brandé complet (logo/signature) ; versionnement/historique ; détection de changement de loi ; multi-langue.
```
