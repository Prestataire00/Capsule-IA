# Conversion prospect → dossier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir une pré-inscription (`app.prospects`) en dossier réel en un clic — créer/réutiliser apprenant + entreprise, créer le dossier brouillon, signaler les doublons — pour supprimer la double saisie ; la convention en découle automatiquement.

**Architecture:** Approche A — une Server Action `convertProspect` (`authActionClient`) orchestre en TS : matching pur (apprenant par email, entreprise par SIRET/nom) → inserts RLS → RPC `save_dossier` existant → marque le prospect converti. Aucune migration (schéma complet déjà présent).

**Tech Stack:** Next.js 14 Server Actions (`authActionClient` + Zod), Supabase (RLS client + `save_dossier` RPC), Vitest, pgTAP.

**Spec de référence:** `docs/superpowers/specs/2026-06-13-prospect-conversion-design.md`

---

## File Structure

**Créés :**
- `apps/web/features/crm/prospect-conversion/matching.ts` — fonctions pures (match apprenant/entreprise + signalement doublons).
- `apps/web/features/crm/prospect-conversion/matching.test.ts` — vitest.
- `apps/web/features/crm/prospect-conversion/dossier-reference.ts` — génération pure de référence.
- `apps/web/features/crm/prospect-conversion/dossier-reference.test.ts` — vitest.
- `apps/web/features/crm/prospect-conversion/types.ts` — types partagés (prospect, candidats, rapport).
- `apps/web/app/(dashboard)/prospects/convert-schema.ts` — Zod (`{ prospectId }`).
- `apps/web/app/(dashboard)/prospects/actions.ts` — Server Action `convertProspect`.
- `apps/web/app/(dashboard)/prospects/page.tsx` — page de triage (réelle).
- `apps/web/app/(dashboard)/prospects/convert-button.tsx` — client component (déclenche + affiche rapport).

**Aucun fichier modifié, aucune migration.**

## Faits de codebase à connaître

- `app.prospects` (champs) : `id, organization_id (nullable), civility, first_name, last_name, email, phone, birth_date, rqth, formation_id, preferred_modality, preferred_start_date, message, situation, company_name, funder_kind, status, converted_dossier_id, ...`.
- `app.learners` : `organization_id, first_name, last_name, email (CITEXT), phone, birth_date, birth_place, address JSONB, rqth`.
- `app.companies` : `organization_id, name, legal_name, siret CHAR(14), naf_code, vat_number, address, contact_email, contact_phone`.
- `app.dossiers` : `reference TEXT` + `UNIQUE (organization_id, reference)`, `learner_id` (NOT NULL), `company_id` (nullable), `formation_id` (NOT NULL), `status app.dossier_status`, `modality`, `start_date`, `end_date`.
- RPC `public.save_dossier(p_dossier jsonb, p_events jsonb[])` — clés `p_dossier` : `id?, organization_id, reference, learner_id, company_id, formation_id, formation_snapshot, status, modality, start_date, end_date, total_hours, total_amount_cents, currency, notes, modules, metadata`.
- RLS `prospects_select` : visible si `organization_id = current_org OR organization_id IS NULL`.
- Pattern résolution org dans une action : `resolveAdminOrgId(ctx)` — voir `apps/web/app/(dashboard)/formateurs/nouveau/actions.ts` (query `members` filtrée sur `ctx.userId`, `is_default_org DESC`). `authActionClient` ctx = `{ userId, email, supabase }` (PAS de `organizationId`).
- Action client : `useAction(action)` + `.executeAsync(input)` — voir `features/identity/trainer-self/ui/*`.
- Casts `as never` tolérés tant que `prospects`/colonnes manquent dans `database.ts` (convention repo).
- ⚠️ Docker durablement indisponible → tâches DB en write-only / PENDING ; Vitest fonctionne.

---

## Task 1 : Types partagés

**Files:** Create `apps/web/features/crm/prospect-conversion/types.ts`

- [ ] **Step 1 : Écrire les types**

```ts
export type ProspectForConversion = {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  rqth: boolean;
  formationId: string | null;
  preferredModality: string | null;
  preferredStartDate: string | null;
  companyName: string | null;
  funderKind: string;
  convertedDossierId: string | null;
};

export type LearnerCandidate = { id: string; email: string; lastName: string };
export type CompanyCandidate = { id: string; name: string; siret: string | null };

export type MatchResult = { action: 'reuse'; id: string } | { action: 'create' };

export type DuplicateSignal = {
  kind: 'learner' | 'company';
  reason: string;
  existingId: string;
  label: string;
};

export type ConversionReport = {
  learner: 'reused' | 'created';
  company: 'reused' | 'created' | 'none';
  signals: DuplicateSignal[];
  alreadyConverted?: boolean;
};
```

- [ ] **Step 2 : Commit**

```bash
git add apps/web/features/crm/prospect-conversion/types.ts
git commit -m "feat(crm): types de la conversion prospect→dossier"
```

---

## Task 2 : Matching pur (TDD Vitest)

**Files:** Create `apps/web/features/crm/prospect-conversion/matching.ts` + `matching.test.ts`

- [ ] **Step 1 : Test (échoue d'abord)**

```ts
import { describe, it, expect } from 'vitest';
import { matchLearner, matchCompany, detectPotentialDuplicates } from './matching';
import type { ProspectForConversion, LearnerCandidate, CompanyCandidate } from './types';

const prospect: ProspectForConversion = {
  id: 'p1', organizationId: null, firstName: 'Lea', lastName: 'Martin',
  email: 'Lea.Martin@Mail.com ', phone: null, birthDate: null, rqth: false,
  formationId: 'f1', preferredModality: 'distanciel', preferredStartDate: null,
  companyName: 'Acme SARL', funderKind: 'opco', convertedDossierId: null,
};

describe('matchLearner', () => {
  it('réutilise un apprenant au même email (insensible casse/espaces)', () => {
    const learners: LearnerCandidate[] = [{ id: 'l9', email: 'lea.martin@mail.com', lastName: 'Martin' }];
    expect(matchLearner(prospect.email, learners)).toEqual({ action: 'reuse', id: 'l9' });
  });
  it('crée si aucun email ne correspond', () => {
    expect(matchLearner(prospect.email, [{ id: 'l1', email: 'autre@mail.com', lastName: 'X' }]))
      .toEqual({ action: 'create' });
  });
});

describe('matchCompany', () => {
  const companies: CompanyCandidate[] = [
    { id: 'c1', name: 'Acme SARL', siret: '11111111111111' },
    { id: 'c2', name: 'Autre', siret: '22222222222222' },
  ];
  it('réutilise par SIRET prioritairement', () => {
    expect(matchCompany('22222222222222', 'Nom Different', companies)).toEqual({ action: 'reuse', id: 'c2' });
  });
  it('réutilise par nom normalisé si pas de SIRET', () => {
    expect(matchCompany(null, ' acme  sarl ', companies)).toEqual({ action: 'reuse', id: 'c1' });
  });
  it('crée si rien ne correspond', () => {
    expect(matchCompany(null, 'Inconnue', companies)).toEqual({ action: 'create' });
  });
});

describe('detectPotentialDuplicates', () => {
  it('signale un apprenant de même nom mais email différent', () => {
    const learners: LearnerCandidate[] = [{ id: 'l5', email: 'autre@mail.com', lastName: 'martin' }];
    const signals = detectPotentialDuplicates(prospect, learners, []);
    expect(signals).toContainEqual(expect.objectContaining({ kind: 'learner', existingId: 'l5' }));
  });
  it('ne signale rien quand noms et emails diffèrent', () => {
    const learners: LearnerCandidate[] = [{ id: 'l6', email: 'x@mail.com', lastName: 'Durand' }];
    expect(detectPotentialDuplicates(prospect, learners, [])).toEqual([]);
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test prospect-conversion/matching` → FAIL.
- [ ] **Step 3 : Implémenter**

```ts
import type {
  ProspectForConversion, LearnerCandidate, CompanyCandidate, MatchResult, DuplicateSignal,
} from './types';

const norm = (s: string | null): string => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function matchLearner(email: string, learners: readonly LearnerCandidate[]): MatchResult {
  const target = norm(email);
  const hit = learners.find((l) => norm(l.email) === target);
  return hit ? { action: 'reuse', id: hit.id } : { action: 'create' };
}

export function matchCompany(
  siret: string | null,
  name: string | null,
  companies: readonly CompanyCandidate[],
): MatchResult {
  const cleanSiret = (siret ?? '').replace(/\s+/g, '');
  if (cleanSiret) {
    const bySiret = companies.find((c) => (c.siret ?? '').replace(/\s+/g, '') === cleanSiret);
    if (bySiret) return { action: 'reuse', id: bySiret.id };
  }
  const target = norm(name);
  if (target) {
    const byName = companies.find((c) => norm(c.name) === target);
    if (byName) return { action: 'reuse', id: byName.id };
  }
  return { action: 'create' };
}

export function detectPotentialDuplicates(
  prospect: ProspectForConversion,
  learners: readonly LearnerCandidate[],
  companies: readonly CompanyCandidate[],
): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  const emailNorm = norm(prospect.email);
  const lastNorm = norm(prospect.lastName);
  for (const l of learners) {
    if (norm(l.lastName) === lastNorm && norm(l.email) !== emailNorm) {
      signals.push({
        kind: 'learner', existingId: l.id,
        reason: 'Même nom, email différent',
        label: `${prospect.lastName} — ${l.email}`,
      });
    }
  }
  const companyNorm = norm(prospect.companyName);
  if (companyNorm) {
    for (const c of companies) {
      if (norm(c.name) === companyNorm) {
        signals.push({
          kind: 'company', existingId: c.id,
          reason: 'Entreprise au nom identique',
          label: c.name,
        });
      }
    }
  }
  return signals;
}
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test prospect-conversion/matching` → PASS.
- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/crm/prospect-conversion/matching.ts apps/web/features/crm/prospect-conversion/matching.test.ts
git commit -m "feat(crm): matching pur apprenant/entreprise + signalement doublons"
```

---

## Task 3 : Référence dossier pure (TDD Vitest)

**Files:** Create `apps/web/features/crm/prospect-conversion/dossier-reference.ts` + `dossier-reference.test.ts`

- [ ] **Step 1 : Test**

```ts
import { describe, it, expect } from 'vitest';
import { generateDossierReference } from './dossier-reference';

describe('generateDossierReference', () => {
  it('forme DOS-AAAA-XXXXXXXX déterministe à partir de l\'id prospect', () => {
    const ref = generateDossierReference('abcdef12-3456-7890-abcd-ef1234567890', 2026);
    expect(ref).toBe('DOS-2026-ABCDEF12');
  });
  it('est stable pour le même prospect (idempotence)', () => {
    const id = 'abcdef12-3456-7890-abcd-ef1234567890';
    expect(generateDossierReference(id, 2026)).toBe(generateDossierReference(id, 2026));
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test prospect-conversion/dossier-reference` → FAIL.
- [ ] **Step 3 : Implémenter**

```ts
// Référence dossier déterministe par prospect → idempotence à la re-conversion
// (l'unicité réelle est garantie par le check converted_dossier_id en amont).
export function generateDossierReference(prospectId: string, year: number): string {
  const short = prospectId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `DOS-${year}-${short}`;
}
```

- [ ] **Step 4 : Lancer pour succès** — PASS.
- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/crm/prospect-conversion/dossier-reference.ts apps/web/features/crm/prospect-conversion/dossier-reference.test.ts
git commit -m "feat(crm): génération déterministe de référence dossier"
```

---

## Task 4 : Server Action `convertProspect`

**Files:** Create `apps/web/app/(dashboard)/prospects/convert-schema.ts` + `apps/web/app/(dashboard)/prospects/actions.ts`

- [ ] **Step 1 : Lire** `apps/web/app/(dashboard)/formateurs/nouveau/actions.ts` pour copier la fonction `resolveAdminOrgId(ctx)` (résolution org via `members`), et `apps/web/shared/lib/safe-action.ts` pour confirmer `authActionClient` et la forme de `ctx`.

- [ ] **Step 2 : Schéma Zod**

```ts
import { z } from 'zod';
export const ConvertProspectSchema = z.object({ prospectId: z.string().uuid() });
export type ConvertProspectInput = z.infer<typeof ConvertProspectSchema>;
```

- [ ] **Step 3 : Implémenter l'action** (`actions.ts`)

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { ConvertProspectSchema } from './convert-schema';
import { matchLearner, matchCompany, detectPotentialDuplicates } from '@/features/crm/prospect-conversion/matching';
import { generateDossierReference } from '@/features/crm/prospect-conversion/dossier-reference';
import type {
  ProspectForConversion, LearnerCandidate, CompanyCandidate, ConversionReport,
} from '@/features/crm/prospect-conversion/types';

// Réplique du pattern resolveAdminOrgId (cf. formateurs/nouveau/actions.ts) — à aligner si le
// fichier source diffère.
async function resolveOrgId(ctx: { userId: string; supabase: any }): Promise<string> {
  const { data } = await ctx.supabase
    .schema('app').from('members')
    .select('organization_id, is_default_org')
    .eq('user_id', ctx.userId)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  const orgId = (data as { organization_id: string } | null)?.organization_id;
  if (!orgId) throw new Error('no_org_for_user');
  return orgId;
}

export const convertProspect = authActionClient
  .schema(ConvertProspectSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveOrgId(ctx as never);

    // 1. Charger le prospect (RLS)
    const { data: pRow, error: pErr } = await sb
      .schema('app').from('prospects')
      .select('id, organization_id, civility, first_name, last_name, email, phone, birth_date, rqth, formation_id, preferred_modality, preferred_start_date, company_name, funder_kind, converted_dossier_id')
      .eq('id', parsedInput.prospectId)
      .maybeSingle();
    if (pErr || !pRow) return { ok: false as const, error: 'prospect_not_found' };
    const p = pRow as never as {
      id: string; organization_id: string | null;
      first_name: string; last_name: string; email: string; phone: string | null;
      birth_date: string | null; rqth: boolean; formation_id: string | null;
      preferred_modality: string | null; preferred_start_date: string | null;
      company_name: string | null; funder_kind: string; converted_dossier_id: string | null;
    };

    // 2. Idempotence
    if (p.converted_dossier_id) {
      return { ok: true as const, dossierId: p.converted_dossier_id, report: { learner: 'reused', company: 'none', signals: [], alreadyConverted: true } satisfies ConversionReport };
    }
    if (!p.formation_id) return { ok: false as const, error: 'prospect_without_formation' };

    const prospect: ProspectForConversion = {
      id: p.id, organizationId: p.organization_id,
      firstName: p.first_name, lastName: p.last_name, email: p.email, phone: p.phone,
      birthDate: p.birth_date, rqth: p.rqth, formationId: p.formation_id,
      preferredModality: p.preferred_modality, preferredStartDate: p.preferred_start_date,
      companyName: p.company_name, funderKind: p.funder_kind, convertedDossierId: null,
    };

    // 3. Apprenant : match / create
    const { data: learnersData } = await sb
      .schema('app').from('learners')
      .select('id, email, last_name').eq('organization_id', orgId);
    const learners = ((learnersData ?? []) as never as Array<{ id: string; email: string; last_name: string }>)
      .map<LearnerCandidate>((l) => ({ id: l.id, email: l.email, lastName: l.last_name }));
    const lm = matchLearner(prospect.email, learners);
    let learnerId: string;
    let learnerOutcome: 'reused' | 'created';
    if (lm.action === 'reuse') {
      learnerId = lm.id; learnerOutcome = 'reused';
    } else {
      const { data: ins, error } = await sb.schema('app').from('learners').insert({
        organization_id: orgId, first_name: prospect.firstName, last_name: prospect.lastName,
        email: prospect.email, phone: prospect.phone, birth_date: prospect.birthDate, rqth: prospect.rqth,
      } as never).select('id').single();
      if (error || !ins) return { ok: false as const, error: 'learner_create_failed' };
      learnerId = (ins as { id: string }).id; learnerOutcome = 'created';
    }

    // 4. Entreprise : match / create (seulement si company_name)
    const { data: companiesData } = await sb
      .schema('app').from('companies')
      .select('id, name, siret').eq('organization_id', orgId);
    const companies = ((companiesData ?? []) as never as Array<{ id: string; name: string; siret: string | null }>)
      .map<CompanyCandidate>((c) => ({ id: c.id, name: c.name, siret: c.siret }));
    let companyId: string | null = null;
    let companyOutcome: 'reused' | 'created' | 'none' = 'none';
    if (prospect.companyName) {
      const cm = matchCompany(null, prospect.companyName, companies);
      if (cm.action === 'reuse') {
        companyId = cm.id; companyOutcome = 'reused';
      } else {
        const { data: ins, error } = await sb.schema('app').from('companies').insert({
          organization_id: orgId, name: prospect.companyName,
        } as never).select('id').single();
        if (error || !ins) return { ok: false as const, error: 'company_create_failed' };
        companyId = (ins as { id: string }).id; companyOutcome = 'created';
      }
    }

    // 5. Signalements doublons
    const signals = detectPotentialDuplicates(prospect, learners, companies);

    // 6. Dossier via save_dossier
    const year = Number(new Date().getFullYear());
    const reference = generateDossierReference(prospect.id, year);
    const { data: dossierRes, error: dErr } = await sb.rpc('save_dossier' as never, {
      p_dossier: {
        organization_id: orgId,
        reference,
        learner_id: learnerId,
        company_id: companyId,
        formation_id: prospect.formationId,
        status: 'draft',
        modality: prospect.preferredModality ?? 'distanciel',
        start_date: prospect.preferredStartDate,
        metadata: { from_prospect: prospect.id, funder_kind: prospect.funderKind },
      },
      p_events: [],
    } as never);
    if (dErr) return { ok: false as const, error: 'dossier_create_failed', details: dErr.message };
    const dossierId = (dossierRes as { id?: string } | null)?.id
      ?? (typeof dossierRes === 'string' ? dossierRes : null);
    if (!dossierId) return { ok: false as const, error: 'dossier_id_missing' };

    // 7. Marquer le prospect converti + revendiquer l'org
    await sb.schema('app').from('prospects').update({
      converted_dossier_id: dossierId, status: 'converted', organization_id: orgId,
    } as never).eq('id', prospect.id);

    revalidatePath('/prospects');
    const report: ConversionReport = { learner: learnerOutcome, company: companyOutcome, signals };
    return { ok: true as const, dossierId, report };
  });
```

> Vérifier au moment de l'implémentation : (a) la forme de retour de `save_dossier` (objet `{ id }` vs scalaire) — adapter l'extraction `dossierId` en lisant le `RETURNS jsonb` de `0024_rpc_save_dossier.sql` ; (b) le nom exact du champ org dans `ctx` (le helper `resolveAdminOrgId` source fait foi).

- [ ] **Step 4 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "prospects/(actions|convert-schema)"` → seules erreurs tolérées : `@/env.mjs`. Corriger toute NOUVELLE erreur réelle.
- [ ] **Step 5 : Commit**

```bash
git add "apps/web/app/(dashboard)/prospects/convert-schema.ts" "apps/web/app/(dashboard)/prospects/actions.ts"
git commit -m "feat(prospects): Server Action convertProspect (idempotente + dédoublonnage)"
```

---

## Task 5 : pgTAP — RLS prospects + lien conversion (write-only)

**Files:** Create `supabase/tests/0051_test_prospects_conversion.sql`

> Numéro `0051` pour rester au-delà des branches ouvertes (PR #1 : tests 0047/0048 ; PR #2 : 0049/0050). Vérifier le prochain libre au moment de l'exécution.

- [ ] **Step 1 : Écrire le test**

```sql
-- ============================================================================
-- Tests pgTAP : RLS prospects (org + non assignés) et lien de conversion
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111'),
  ('00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OF B', 'OF B SARL', '22222222222222');
INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@of.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO app.profiles (user_id, full_name, email) VALUES
  ('owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'a@of.test');
INSERT INTO app.members (organization_id, user_id, role, is_default_org) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'::app.member_role, true);

-- 3 prospects : un de A, un non assigné, un de B
INSERT INTO app.prospects (id, organization_id, first_name, last_name, email, situation, funder_kind, status) VALUES
  ('p0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'A', 'a@p.test', 'salarie', 'opco', 'new'),
  ('p0u00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL,                                    'U', 'U', 'u@p.test', 'salarie', 'opco', 'new'),
  ('p0b00000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', 'B', 'b@p.test', 'salarie', 'opco', 'new');

SELECT tests.as_authenticated();
SELECT tests.set_jwt('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner', 'owner-0a0-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- A voit son prospect + le non assigné, mais pas celui de B
SELECT is((SELECT count(*)::int FROM app.prospects), 2, 'Org A voit son prospect + le non assigné');
SELECT is((SELECT count(*)::int FROM app.prospects WHERE organization_id = '00bbb000-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'Org A ne voit pas le prospect assigné à B');

-- Service role : poser converted_dossier_id + status converted tient (lien de conversion)
SELECT tests.clear_jwt();
SELECT tests.as_service_role();
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', 'A', 'a@p.test');
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-2026-P0A00000', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, 'draft'
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;
UPDATE app.prospects SET converted_dossier_id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status = 'converted'
  WHERE id = 'p0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT status::text FROM app.prospects WHERE id = 'p0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'converted', 'Le prospect converti porte le statut converted + le dossier lié');

SELECT * FROM finish();
ROLLBACK;
```

> Note : si `app.formations` exige un `formation_id` réel et qu'aucune formation n'existe pour l'org A, insérer une formation minimale avant le dossier (lire les colonnes NOT NULL de `app.formations`). La 3ᵉ assertion peut être simplifiée si la création de dossier de test est trop couplée — l'essentiel est la 1ʳᵉ/2ᵉ (isolation RLS).

- [ ] **Step 2 : Lancer** — `pnpm db:test` (PENDING si Docker down).
- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/0051_test_prospects_conversion.sql
git commit -m "test(prospects): pgTAP isolation RLS + lien de conversion"
```

---

## Task 6 : Page de triage `/prospects` + bouton de conversion

**Files:** Create `apps/web/app/(dashboard)/prospects/page.tsx` + `apps/web/app/(dashboard)/prospects/convert-button.tsx`

- [ ] **Step 1 : Lire** une page dashboard réelle (`apps/web/app/(dashboard)/factures/page.tsx`) pour le pattern de lecture (`createClient(service_role)` OU `supabaseServer()`), et `features/identity/trainer-self/ui/*` pour l'invocation `useAction().executeAsync`.

- [ ] **Step 2 : Bouton client `convert-button.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { convertProspect } from './actions';

export function ConvertButton({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [signals, setSignals] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setError(null);
      const res = await convertProspect({ prospectId });
      const data = res?.data;
      if (!data || data.ok === false) {
        setError(data && 'error' in data ? String(data.error) : 'conversion_failed');
        return;
      }
      setSignals(data.report.signals.map((s) => `${s.reason} : ${s.label}`));
      router.push(`/dossiers/${data.dossierId}`);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={pending}
        className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50">
        <ArrowRightCircle className="w-3.5 h-3.5" />
        {pending ? 'Conversion…' : 'Convertir en dossier'}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
      {signals.map((s) => (
        <span key={s} className="text-[11px] text-amber-600 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {s}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3 : Page `page.tsx`** (archétype `command`, charte v3, lecture réelle des prospects ; adapter le client de lecture au pattern trouvé en Step 1)

```tsx
// ARCHETYPE: command
// Justification: triage des pré-inscriptions + conversion en dossier (anti double-saisie).

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { StatusPill } from '@/shared/ui/status-pill';
import { ConvertButton } from './convert-button';

export const dynamic = 'force-dynamic';

type ProspectRow = {
  id: string; organization_id: string | null;
  first_name: string; last_name: string; email: string;
  company_name: string | null; funder_kind: string; status: string;
  created_at: string; converted_dossier_id: string | null;
};

async function loadProspects(): Promise<ProspectRow[]> {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.schema('app').from('prospects')
    .select('id, organization_id, first_name, last_name, email, company_name, funder_kind, status, created_at, converted_dossier_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as ProspectRow[];
}

export default async function ProspectsPage() {
  const prospects = await loadProspects();
  const pending = prospects.filter((p) => p.status === 'new' || p.status === 'qualified');

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Pré-inscriptions</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          {pending.length} à traiter · convertir en dossier sans ressaisie.
        </p>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_120px_120px_200px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Candidat</div><div>Entreprise</div><div>Financement</div><div>Statut</div><div></div>
        </div>
        {prospects.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">Aucune pré-inscription.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {prospects.map((p) => (
              <li key={p.id} className="grid grid-cols-[1fr_1fr_120px_120px_200px] gap-3 px-5 py-3 items-center text-[13px]">
                <span className="min-w-0">
                  <span className="text-zinc-900 dark:text-zinc-100 block truncate">{p.first_name} {p.last_name}</span>
                  <span className="text-[11px] text-zinc-500 truncate">{p.email}</span>
                  {p.organization_id === null && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">non assigné</span>
                  )}
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 truncate">{p.company_name ?? '—'}</span>
                <span className="text-zinc-500 text-[12px] uppercase">{p.funder_kind}</span>
                <StatusPill tone={p.status === 'converted' ? 'success' : p.status === 'archived' ? 'neutral' : 'warning'}>
                  {p.status}
                </StatusPill>
                <div className="flex justify-end">
                  {p.converted_dossier_id
                    ? <a href={`/dossiers/${p.converted_dossier_id}`} className="text-[12px] text-violet-600 hover:underline">Voir le dossier</a>
                    : <ConvertButton prospectId={p.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

> Note : `loadProspects` utilise le client `service_role` (comme `factures/page.tsx`) → il contourne la RLS et liste TOUS les prospects, y compris ceux d'autres orgs. Pour Ismael (OF unique) c'est acceptable à court terme ; si le multi-tenant strict est requis sur cet écran, basculer sur `supabaseServer()` (RLS) + filtrage. Documenter ce choix.

- [ ] **Step 4 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "prospects/(page|convert-button)"` → seules erreurs tolérées : `@/env.mjs`.
- [ ] **Step 5 : Commit**

```bash
git add "apps/web/app/(dashboard)/prospects/page.tsx" "apps/web/app/(dashboard)/prospects/convert-button.tsx"
git commit -m "feat(prospects): page de triage + bouton de conversion"
```

---

## Task 7 : Vérification finale

- [ ] **Step 1 : Suite TS** — `pnpm --filter web test` → tous verts (dont `matching`, `dossier-reference`). `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "features/crm/prospect-conversion|prospects/" | grep -v env.mjs` → aucune nouvelle erreur réelle.
- [ ] **Step 2 : DB (si Docker dispo)** — `pnpm db:test` → pgTAP 0051 vert ; `pnpm db:types` pour typer `prospects` puis retirer les `as never`. Sinon PENDING.
- [ ] **Step 3 : Golden path manuel** — soumettre `/inscription` → prospect dans `/prospects` → Convertir → dossier brouillon créé (apprenant/entreprise réutilisés si déjà présents) → rapport doublons affiché → générer la convention PDF du dossier → données présentes sans ressaisie. Re-cliquer Convertir → renvoie le même dossier (idempotence).
- [ ] **Step 4 : Commit final si ajustements** — `git commit -am "chore(prospects): finalisation conversion"`.

---

## Self-Review

**1. Couverture spec :** §3 flux → T4. §4 matching → T2 (+ types T1). §5 action → T4. §6 triage UI → T6. §8 tests : Vitest → T2/T3, pgTAP → T5, golden path → T7. Référence dossier (§5 step 6) → T3. Aucune section sans tâche. Pas de migration (conforme spec §3).

**2. Placeholders :** les renvois « lire le fichier » concernent `resolveAdminOrgId`/`safe-action`/forme de retour `save_dossier`/pattern page — tous accompagnés du code à écrire et d'un point de vérification précis. Pas de TBD dans les composants neufs.

**3. Cohérence des types :** `matchLearner/matchCompany → MatchResult`, `detectPotentialDuplicates → DuplicateSignal[]`, `ConversionReport`, `ProspectForConversion/LearnerCandidate/CompanyCandidate` définis en T1, consommés à l'identique en T2 et T4. `generateDossierReference(prospectId, year)` (T3) appelé en T4. `convertProspect` retourne `{ ok, dossierId, report }` consommé en T6 (`res.data`).

**Risques résiduels connus :** (a) forme de retour de `save_dossier` (objet `{id}` vs scalaire) — l'action gère les deux mais à confirmer ; (b) la page de triage lit en `service_role` (non-RLS) comme `factures/page.tsx` — acceptable pour OF unique, à durcir si multi-tenant strict requis sur cet écran ; (c) `prospects`/colonnes absents de `database.ts` → casts `as never` jusqu'à `db:types`.
