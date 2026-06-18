# Fiche détail apprenant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de cliquer une card apprenant et d'atterrir sur une fiche `/apprenants/[id]` qui synthétise tout son parcours (formations, heures, assiduité) avec drill-down vers les pages dossier existantes, plus l'édition de son identité et l'anonymisation RGPD.

**Architecture:** La fiche apprenant est un **hub** : en-tête de synthèse (StatCards calculées) + grille de cards dossiers cliquables menant aux pages `/dossiers/[id]` existantes. Server Component (`supabaseServer()` + embeds PostgREST, RLS-scopé), **aucune migration**. Logique de synthèse isolée dans une fonction pure testée. Mutation d'identité via `authActionClient` (next-safe-action) + schéma Zod partagé. Anonymisation RGPD = réutilisation du composant `AnonymizeAction` existant.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase (RLS), next-safe-action, React Hook Form + Zod, TailwindCSS, Vitest.

---

## Contexte de référence (code existant à imiter)

- Liste apprenants (données réelles, stub à débrancher) : `apps/web/app/(dashboard)/apprenants/page.tsx` (ligne 217 : `href="#"`).
- Action de création (pattern mutation learner) : `apps/web/app/(dashboard)/apprenants/nouveau/actions.ts`.
- Pattern page détail + embeds + `notFound()` : `apps/web/app/(dashboard)/dossiers/[id]/layout.tsx`.
- Safe action + ctx.supabase : `apps/web/app/(dashboard)/rgpd/rgpd-actions.ts`, client `@/shared/lib/safe-action`.
- Composant RGPD réutilisable : `apps/web/app/(dashboard)/rgpd/anonymize-action.tsx` (`AnonymizeAction`).
- UI partagée : `StatCard` (`@/shared/ui/stat-card`), `EmptyState` (`@/shared/ui/empty-state`), `FormField` + `inputClass` (`@/shared/ui/form-field`), `StatusPill` + `dossierStatusLabel` + `dossierStatusTone` (`@/shared/ui/status-pill`).
- Org / rôle courant : `getCurrentMember()` (`@/shared/lib/auth/current-member`) → `{ organizationId, role }`.
- Tests : Vitest, exemple pur `apps/web/shared/lib/qr.test.ts`.

**Enums dossier** (déjà en base) :
- `dossier_status` : `draft, pending_validation, scheduled, active, completed, closed, archived, cancelled`.
- `training_modality` : `presentiel, distanciel, hybride, afest`.

**Colonnes utiles** :
- `app.dossiers` : `id, reference, status, modality, start_date, end_date, total_hours, total_amount_cents, formation_id, learner_id, formation_snapshot (jsonb), deleted_at`. Titre formation via embed `formation:formations(title)`.
- `app.dossier_hours_tracking` (PK = `dossier_id`, 1-1) : `hours_planned, hours_attended, attendance_rate, at_risk`.
- `app.learners` : `id, first_name, last_name, email, phone, birth_date, position, statut, rqth, accessibility_notes, cpf_number, company_id, anonymized_at, deleted_at`.

---

## File Structure

| Fichier | Responsabilité |
|---------|----------------|
| `apps/web/app/(dashboard)/apprenants/[id]/summary.ts` | **Pur** : types `LearnerDossier`/`LearnerSummary` + `buildLearnerSummary()` + `normalizeOne()`. Aucun import Supabase/React. |
| `apps/web/app/(dashboard)/apprenants/[id]/summary.test.ts` | Tests Vitest de la logique pure. |
| `apps/web/app/(dashboard)/apprenants/[id]/schema.ts` | `UpdateLearnerSchema` (Zod) partagé form ↔ action. |
| `apps/web/app/(dashboard)/apprenants/[id]/actions.ts` | `updateLearner` (safe action). |
| `apps/web/app/(dashboard)/apprenants/[id]/page.tsx` | Server Component : fetch learner + dossiers, `notFound()`, assemble, rend header + grille de cards / empty state. |
| `apps/web/app/(dashboard)/apprenants/[id]/dossier-card.tsx` | Card d'un dossier (lien vers `/dossiers/[id]`). Composant serveur pur (présentationnel). |
| `apps/web/app/(dashboard)/apprenants/[id]/learner-header.tsx` | Client : en-tête identité + StatCards synthèse + barre d'actions (édition, `AnonymizeAction`, lien Nouveau dossier). |
| `apps/web/app/(dashboard)/apprenants/[id]/edit-learner-dialog.tsx` | Client : formulaire d'édition identité → `updateLearner`. |
| `apps/web/app/(dashboard)/apprenants/page.tsx` (modif) | Débrancher le stub `href="#"` → `/apprenants/${l.id}`. |
| `docs/coordination/CLAIMS.md` (modif) | Claim de la zone. |

---

## Task 1: Claimer la zone (coordination parallèle)

**Files:**
- Modify: `docs/coordination/CLAIMS.md`

- [ ] **Step 1: Re-vérifier l'absence de collision**

Run:
```bash
cd /Users/anissa/i-a-infinity-of && git fetch origin -q && git log origin/main --oneline -15 && grep -i "apprenant" docs/coordination/CLAIMS.md
```
Expected : aucune ligne *active* ne mentionne une fiche détail apprenant (`apprenants/[id]`). Si une autre instance l'a prise → STOP et coordonner.

- [ ] **Step 2: Ajouter la ligne de claim**

Dans `docs/coordination/CLAIMS.md`, sous `## Claims actifs`, ajouter une ligne de tableau :

```markdown
| Opus (fiche-apprenant) | Fiche détail apprenant (hub) : `app/(dashboard)/apprenants/[id]/**` (page + header + cards + edit) ; débranchement stub `href` dans `apprenants/page.tsx`. Réutilise `AnonymizeAction` + pages `/dossiers/[id]`. **Sans migration.** | feature/fiche-detail-apprenant | 2026-06-18 | actif |
```

- [ ] **Step 3: Commit + push le claim**

```bash
cd /Users/anissa/i-a-infinity-of && git add docs/coordination/CLAIMS.md && git commit -m "chore(coord): claim fiche détail apprenant" && git push -u origin feature/fiche-detail-apprenant
```
Expected : push OK, branche suivie.

---

## Task 2: Fonction pure de synthèse (TDD)

**Files:**
- Create: `apps/web/app/(dashboard)/apprenants/[id]/summary.ts`
- Test: `apps/web/app/(dashboard)/apprenants/[id]/summary.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `apps/web/app/(dashboard)/apprenants/[id]/summary.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { buildLearnerSummary, normalizeOne, type LearnerDossier } from './summary';

const dossier = (over: Partial<LearnerDossier> = {}): LearnerDossier => ({
  id: 'd1',
  reference: 'DOS-1',
  status: 'active',
  modality: 'presentiel',
  start_date: '2026-01-01',
  end_date: '2026-02-01',
  total_hours: 28,
  total_amount_cents: 150000,
  formationTitle: 'Excel',
  hours: { hours_planned: 28, hours_attended: 21, attendance_rate: 90, at_risk: true },
  ...over,
});

describe('normalizeOne', () => {
  it('retourne null pour null/undefined/[]', () => {
    expect(normalizeOne(null)).toBeNull();
    expect(normalizeOne(undefined)).toBeNull();
    expect(normalizeOne([])).toBeNull();
  });
  it('extrait le premier élément d’un tableau (embed PostgREST)', () => {
    expect(normalizeOne([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
  });
  it('retourne l’objet tel quel si ce n’est pas un tableau', () => {
    expect(normalizeOne({ a: 1 })).toEqual({ a: 1 });
  });
});

describe('buildLearnerSummary', () => {
  it('renvoie des zéros pour aucun dossier', () => {
    expect(buildLearnerSummary([])).toEqual({
      formationsCount: 0,
      hoursAttended: 0,
      hoursPlanned: 0,
      avgAttendanceRate: 0,
      atRiskCount: 0,
    });
  });

  it('agrège heures, assiduité moyenne et dossiers à risque', () => {
    const s = buildLearnerSummary([
      dossier({ id: 'a', hours: { hours_planned: 28, hours_attended: 21, attendance_rate: 90, at_risk: true } }),
      dossier({ id: 'b', hours: { hours_planned: 40, hours_attended: 40, attendance_rate: 100, at_risk: false } }),
    ]);
    expect(s.formationsCount).toBe(2);
    expect(s.hoursAttended).toBe(61);
    expect(s.hoursPlanned).toBe(68);
    expect(s.avgAttendanceRate).toBe(95); // (90 + 100) / 2
    expect(s.atRiskCount).toBe(1);
  });

  it('ignore les dossiers sans suivi d’heures dans la moyenne d’assiduité', () => {
    const s = buildLearnerSummary([
      dossier({ id: 'a', hours: { hours_planned: 10, hours_attended: 5, attendance_rate: 50, at_risk: false } }),
      dossier({ id: 'b', hours: null }),
    ]);
    expect(s.formationsCount).toBe(2);
    expect(s.hoursAttended).toBe(5);
    expect(s.avgAttendanceRate).toBe(50); // moyenne sur le seul dossier suivi
  });

  it('arrondit la moyenne d’assiduité à l’entier', () => {
    const s = buildLearnerSummary([
      dossier({ id: 'a', hours: { hours_planned: 10, hours_attended: 3, attendance_rate: 33, at_risk: false } }),
      dossier({ id: 'b', hours: { hours_planned: 10, hours_attended: 7, attendance_rate: 66, at_risk: false } }),
    ]);
    expect(s.avgAttendanceRate).toBe(50); // round((33 + 66)/2) = round(49.5) = 50
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && pnpm vitest run "app/(dashboard)/apprenants/[id]/summary.test.ts"
```
Expected : FAIL — `Cannot find module './summary'`.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `apps/web/app/(dashboard)/apprenants/[id]/summary.ts` :

```typescript
export type DossierHours = {
  hours_planned: number;
  hours_attended: number;
  attendance_rate: number;
  at_risk: boolean;
} | null;

export type LearnerDossier = {
  id: string;
  reference: string;
  status: string;
  modality: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  total_amount_cents: number | null;
  formationTitle: string | null;
  hours: DossierHours;
};

export type LearnerSummary = {
  formationsCount: number;
  hoursAttended: number;
  hoursPlanned: number;
  avgAttendanceRate: number;
  atRiskCount: number;
};

/** Les embeds PostgREST renvoient parfois un tableau, parfois un objet (relation 1-1). */
export function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value.length > 0 ? (value[0] as T) : null;
  return value;
}

export function buildLearnerSummary(dossiers: LearnerDossier[]): LearnerSummary {
  let hoursAttended = 0;
  let hoursPlanned = 0;
  let atRiskCount = 0;
  const rates: number[] = [];

  for (const d of dossiers) {
    if (d.hours) {
      hoursAttended += d.hours.hours_attended;
      hoursPlanned += d.hours.hours_planned;
      if (d.hours.at_risk) atRiskCount += 1;
      rates.push(d.hours.attendance_rate);
    }
  }

  const avgAttendanceRate =
    rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  return {
    formationsCount: dossiers.length,
    hoursAttended,
    hoursPlanned,
    avgAttendanceRate,
    atRiskCount,
  };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && pnpm vitest run "app/(dashboard)/apprenants/[id]/summary.test.ts"
```
Expected : PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/[id]/summary.ts" "apps/web/app/(dashboard)/apprenants/[id]/summary.test.ts" && git commit -m "feat(apprenants): synthèse pure buildLearnerSummary + tests"
```

---

## Task 3: Schéma Zod + action `updateLearner`

**Files:**
- Create: `apps/web/app/(dashboard)/apprenants/[id]/schema.ts`
- Create: `apps/web/app/(dashboard)/apprenants/[id]/actions.ts`

- [ ] **Step 1: Créer le schéma Zod partagé**

Créer `apps/web/app/(dashboard)/apprenants/[id]/schema.ts` :

```typescript
import { z } from 'zod';

export const STATUTS = ['salarie', 'dirigeant', 'independant'] as const;

export const UpdateLearnerSchema = z.object({
  learnerId: z.string().uuid(),
  firstName: z.string().trim().min(1, 'Prénom requis'),
  lastName: z.string().trim().min(1, 'Nom requis'),
  email: z.string().trim().email('Email invalide'),
  phone: z.string().trim().max(40).optional().nullable(),
  position: z.string().trim().max(120).optional().nullable(),
  statut: z.enum(STATUTS).nullable().optional(),
  rqth: z.boolean(),
  accessibilityNotes: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateLearnerInput = z.infer<typeof UpdateLearnerSchema>;
```

- [ ] **Step 2: Créer l'action `updateLearner`**

Créer `apps/web/app/(dashboard)/apprenants/[id]/actions.ts` :

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { UpdateLearnerSchema } from './schema';

type UpdateLearnerResult = { ok: true } | { ok: false; error: string };

export const updateLearner = authActionClient
  .schema(UpdateLearnerSchema)
  .action(async ({ parsedInput, ctx }): Promise<UpdateLearnerResult> => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('learners')
      .update({
        first_name: parsedInput.firstName,
        last_name: parsedInput.lastName,
        email: parsedInput.email,
        phone: parsedInput.phone ?? null,
        position: parsedInput.position ?? null,
        statut: parsedInput.statut ?? null,
        rqth: parsedInput.rqth,
        accessibility_notes: parsedInput.accessibilityNotes ?? null,
      })
      .eq('id', parsedInput.learnerId)
      .is('deleted_at', null);

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/apprenants/${parsedInput.learnerId}`);
    revalidatePath('/apprenants');
    return { ok: true };
  });
```

> Note : `ctx.supabase` est RLS-scopé ; la policy `learners_update` (staff de l'org) s'applique. Pas de bypass `service_role`.

- [ ] **Step 3: Vérifier la compilation de l'action**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "apprenants/\[id\]" || echo "OK: pas d'erreur sur la zone apprenants/[id]"
```
Expected : `OK: pas d'erreur sur la zone apprenants/[id]` (le typecheck global n'est pas vert sur ce repo — on ne filtre que notre zone).

- [ ] **Step 4: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/[id]/schema.ts" "apps/web/app/(dashboard)/apprenants/[id]/actions.ts" && git commit -m "feat(apprenants): schéma Zod + action updateLearner"
```

---

## Task 4: Card dossier (présentationnel)

**Files:**
- Create: `apps/web/app/(dashboard)/apprenants/[id]/dossier-card.tsx`

- [ ] **Step 1: Créer le composant card**

Créer `apps/web/app/(dashboard)/apprenants/[id]/dossier-card.tsx` :

```tsx
import Link from 'next/link';
import { ArrowUpRight, Clock, AlertTriangle } from 'lucide-react';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import type { LearnerDossier } from './summary';

const fmtDate = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const modalityLabel = (m: string) =>
  (({ presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride', afest: 'AFEST' }) as Record<string, string>)[m] ?? m;

export function DossierCard({ dossier }: { dossier: LearnerDossier }) {
  const h = dossier.hours;
  return (
    <Link
      href={`/dossiers/${dossier.id}`}
      className="group block bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-violet-200 dark:hover:border-violet-900/60 transition"
    >
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-mono text-zinc-500 dark:text-zinc-400">{dossier.reference}</p>
          <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {dossier.formationTitle ?? '—'}
          </p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition flex-shrink-0" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <StatusPill tone={dossierStatusTone(dossier.status)}>{dossierStatusLabel(dossier.status)}</StatusPill>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{modalityLabel(dossier.modality)}</span>
        {h?.at_risk && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 inline-flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" /> à risque
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[12px] text-zinc-600 dark:text-zinc-400">
        <span>{fmtDate(dossier.start_date)} → {fmtDate(dossier.end_date)}</span>
        {h && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {Number(h.hours_attended)}/{Number(h.hours_planned)} h · {Number(h.attendance_rate)}%
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/[id]/dossier-card.tsx" && git commit -m "feat(apprenants): card dossier (lien vers fiche dossier)"
```

---

## Task 5: Formulaire d'édition identité (client)

**Files:**
- Create: `apps/web/app/(dashboard)/apprenants/[id]/edit-learner-dialog.tsx`

- [ ] **Step 1: Créer le dialog d'édition**

Créer `apps/web/app/(dashboard)/apprenants/[id]/edit-learner-dialog.tsx` :

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { updateLearner } from './actions';
import type { UpdateLearnerInput } from './schema';

type Props = {
  learner: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    position: string | null;
    statut: string | null;
    rqth: boolean;
    accessibility_notes: string | null;
  };
};

export function EditLearnerDialog({ learner }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const input: UpdateLearnerInput = {
      learnerId: learner.id,
      firstName: String(fd.get('firstName') ?? ''),
      lastName: String(fd.get('lastName') ?? ''),
      email: String(fd.get('email') ?? ''),
      phone: (String(fd.get('phone') ?? '').trim() || null),
      position: (String(fd.get('position') ?? '').trim() || null),
      statut: (fd.get('statut') ? (String(fd.get('statut')) as UpdateLearnerInput['statut']) : null),
      rqth: fd.get('rqth') === 'on',
      accessibilityNotes: (String(fd.get('accessibilityNotes') ?? '').trim() || null),
    };
    startTransition(async () => {
      const res = await updateLearner(input);
      const data = res?.data;
      if (data?.ok) {
        setOpen(false);
        window.location.reload();
      } else {
        setError(data && !data.ok ? data.error : 'Échec de l’enregistrement.');
      }
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[12px] text-zinc-600 dark:text-zinc-300 hover:underline inline-flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" /> Modifier
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Prénom" required>
          <input name="firstName" defaultValue={learner.first_name} className={inputClass} />
        </FormField>
        <FormField label="Nom" required>
          <input name="lastName" defaultValue={learner.last_name} className={inputClass} />
        </FormField>
        <FormField label="Email" required>
          <input name="email" type="email" defaultValue={learner.email} className={inputClass} />
        </FormField>
        <FormField label="Téléphone">
          <input name="phone" defaultValue={learner.phone ?? ''} className={inputClass} />
        </FormField>
        <FormField label="Poste / fonction">
          <input name="position" defaultValue={learner.position ?? ''} className={inputClass} />
        </FormField>
        <FormField label="Statut">
          <select name="statut" defaultValue={learner.statut ?? ''} className={inputClass}>
            <option value="">—</option>
            <option value="salarie">Salarié</option>
            <option value="dirigeant">Dirigeant</option>
            <option value="independant">Indépendant</option>
          </select>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
        <input type="checkbox" name="rqth" defaultChecked={learner.rqth} /> RQTH
      </label>
      <FormField label="Notes d’accessibilité">
        <textarea name="accessibilityNotes" defaultValue={learner.accessibility_notes ?? ''} rows={3} className={inputClass} />
      </FormField>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending} variant="primary">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </Button>
        <Button type="button" onClick={() => setOpen(false)} variant="secondary" disabled={pending}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
```

> Note : si `Button` n'expose pas la variante `primary`, utiliser la même variante que celle employée dans `apps/web/app/(dashboard)/rgpd/anonymize-action.tsx` (`danger`/`secondary`) — vérifier les variantes disponibles dans `@/shared/ui/button` au moment d'écrire ce fichier et adapter.

- [ ] **Step 2: Vérifier la compilation**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "edit-learner-dialog" || echo "OK"
```
Expected : `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/[id]/edit-learner-dialog.tsx" && git commit -m "feat(apprenants): dialog édition identité apprenant"
```

---

## Task 6: En-tête apprenant (client) — synthèse + actions

**Files:**
- Create: `apps/web/app/(dashboard)/apprenants/[id]/learner-header.tsx`

- [ ] **Step 1: Créer l'en-tête**

Créer `apps/web/app/(dashboard)/apprenants/[id]/learner-header.tsx` :

```tsx
'use client';

import Link from 'next/link';
import { Plus, GraduationCap, Clock, TrendingUp, AlertTriangle, Mail, Phone, Accessibility } from 'lucide-react';
import { StatCard } from '@/shared/ui/stat-card';
import { AnonymizeAction } from '../../rgpd/anonymize-action';
import { EditLearnerDialog } from './edit-learner-dialog';
import type { LearnerSummary } from './summary';

type Learner = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  statut: string | null;
  rqth: boolean;
  accessibility_notes: string | null;
  anonymized_at: string | null;
  companyName: string | null;
};

const STATUT_LABEL: Record<string, string> = {
  salarie: 'Salarié',
  dirigeant: 'Dirigeant',
  independant: 'Indépendant',
};

export function LearnerHeader({
  learner,
  summary,
  isOwnerAdmin,
}: {
  learner: Learner;
  summary: LearnerSummary;
  isOwnerAdmin: boolean;
}) {
  const fullName = `${learner.first_name} ${learner.last_name}`.trim();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-medium text-zinc-900 dark:text-zinc-100">{fullName}</h1>
            {learner.statut && (
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{STATUT_LABEL[learner.statut] ?? learner.statut}</span>
            )}
            {learner.rqth && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 inline-flex items-center gap-1">
                <Accessibility className="w-2.5 h-2.5" /> RQTH
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[13px] text-zinc-600 dark:text-zinc-400 flex-wrap">
            <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{learner.email}</span>
            {learner.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{learner.phone}</span>}
            {learner.companyName && <span>{learner.companyName}</span>}
            {learner.position && <span>{learner.position}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!learner.anonymized_at && <EditLearnerDialog learner={learner} />}
          <Link
            href={`/dossiers/nouveau?learnerId=${learner.id}`}
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] px-3 py-1.5 rounded-md transition inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Nouveau dossier
          </Link>
        </div>
      </div>

      {learner.accessibility_notes && (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg px-3 py-2">
          <strong className="font-medium">Accessibilité :</strong> {learner.accessibility_notes}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Formations" value={summary.formationsCount} icon={GraduationCap} accent="violet" />
        <StatCard label="Heures réalisées" value={`${summary.hoursAttended}/${summary.hoursPlanned} h`} icon={Clock} accent="blue" hint="suivies / prévues" />
        <StatCard label="Assiduité moyenne" value={`${summary.avgAttendanceRate}%`} icon={TrendingUp} accent="emerald" />
        <StatCard
          label="Dossiers à risque"
          value={summary.atRiskCount}
          icon={AlertTriangle}
          accent={summary.atRiskCount > 0 ? 'amber' : 'zinc'}
          hintTone={summary.atRiskCount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {isOwnerAdmin && !learner.anonymized_at && (
        <AnonymizeAction subject={{ kind: 'learner', id: learner.id, lastName: learner.last_name }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "learner-header" || echo "OK"
```
Expected : `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/[id]/learner-header.tsx" && git commit -m "feat(apprenants): en-tête synthèse + actions apprenant"
```

---

## Task 7: Page détail (Server Component) — fetch + assemblage + rendu

**Files:**
- Create: `apps/web/app/(dashboard)/apprenants/[id]/page.tsx`

- [ ] **Step 1: Créer la page**

Créer `apps/web/app/(dashboard)/apprenants/[id]/page.tsx` :

```tsx
// ARCHETYPE: command
// Justification: fiche détail apprenant en données réelles (RLS-scopé), hub vers les dossiers.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FolderOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { EmptyState } from '@/shared/ui/empty-state';
import { LearnerHeader } from './learner-header';
import { DossierCard } from './dossier-card';
import { buildLearnerSummary, normalizeOne, type LearnerDossier } from './summary';

const OWNER_ADMIN = ['owner', 'admin'];

export default async function ApprenantDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: learnerRow } = await sb
    .schema('app')
    .from('learners')
    .select(
      'id, first_name, last_name, email, phone, position, statut, rqth, accessibility_notes, ' +
        'anonymized_at, company:companies(name)',
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!learnerRow) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lr = learnerRow as any;

  const { data: dossierRows } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, reference, status, modality, start_date, end_date, total_hours, total_amount_cents, ' +
        'formation:formations(title), hours:dossier_hours_tracking(hours_planned, hours_attended, attendance_rate, at_risk)',
    )
    .eq('learner_id', params.id)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  const dossiers: LearnerDossier[] = ((dossierRows ?? []) as unknown[]).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = row as any;
    const formation = normalizeOne(d.formation) as { title: string } | null;
    const hours = normalizeOne(d.hours) as LearnerDossier['hours'];
    return {
      id: d.id,
      reference: d.reference,
      status: d.status,
      modality: d.modality,
      start_date: d.start_date,
      end_date: d.end_date,
      total_hours: Number(d.total_hours ?? 0),
      total_amount_cents: d.total_amount_cents ?? null,
      formationTitle: formation?.title ?? null,
      hours: hours
        ? {
            hours_planned: Number(hours.hours_planned),
            hours_attended: Number(hours.hours_attended),
            attendance_rate: Number(hours.attendance_rate),
            at_risk: Boolean(hours.at_risk),
          }
        : null,
    };
  });

  const summary = buildLearnerSummary(dossiers);
  const member = await getCurrentMember();
  const isOwnerAdmin = !!member && OWNER_ADMIN.includes(member.role);

  const company = normalizeOne(lr.company) as { name: string } | null;

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-8">
        <Link
          href="/apprenants"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Tous les apprenants
        </Link>

        {lr.anonymized_at && (
          <p className="mb-6 text-[13px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
            Cet apprenant a été anonymisé (RGPD). Les données personnelles ont été effacées ; seules les preuves légales pseudonymisées subsistent.
          </p>
        )}

        <LearnerHeader
          learner={{
            id: lr.id,
            first_name: lr.first_name,
            last_name: lr.last_name,
            email: lr.email,
            phone: lr.phone,
            position: lr.position,
            statut: lr.statut,
            rqth: lr.rqth,
            accessibility_notes: lr.accessibility_notes,
            anonymized_at: lr.anonymized_at,
            companyName: company?.name ?? null,
          }}
          summary={summary}
          isOwnerAdmin={isOwnerAdmin}
        />

        <section className="mt-10">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-4">
            Formations &amp; dossiers ({dossiers.length})
          </h2>
          {dossiers.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Aucun dossier pour cet apprenant."
              description="Créez un dossier pour le rattacher à une formation."
              action={
                <Link
                  href={`/dossiers/nouveau?learnerId=${lr.id}`}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] px-3 py-1.5 rounded-md transition inline-flex items-center gap-2"
                >
                  Nouveau dossier
                </Link>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dossiers.map((d) => (
                <li key={d.id}>
                  <DossierCard dossier={d} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation de la zone**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "apprenants/\[id\]/page" || echo "OK"
```
Expected : `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/[id]/page.tsx" && git commit -m "feat(apprenants): page détail apprenant (hub synthèse + dossiers)"
```

---

## Task 8: Débrancher le stub dans la liste

**Files:**
- Modify: `apps/web/app/(dashboard)/apprenants/page.tsx:217`

- [ ] **Step 1: Remplacer le href**

Dans `apps/web/app/(dashboard)/apprenants/page.tsx`, ligne 217, remplacer :

```tsx
                href="#"
```

par :

```tsx
                href={`/apprenants/${l.id}`}
```

- [ ] **Step 2: Vérifier qu'il n'y a plus de stub**

Run:
```bash
cd /Users/anissa/i-a-infinity-of && grep -n 'href="#"' "apps/web/app/(dashboard)/apprenants/page.tsx" || echo "OK: plus de stub"
```
Expected : `OK: plus de stub`.

- [ ] **Step 3: Commit**

```bash
cd /Users/anissa/i-a-infinity-of && git add "apps/web/app/(dashboard)/apprenants/page.tsx" && git commit -m "feat(apprenants): lien card → fiche détail apprenant"
```

---

## Task 9: Vérification finale (build + smoke) & clôture

**Files:** aucun (vérification)

- [ ] **Step 1: Rejouer toute la suite de tests unitaires de la zone**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && pnpm vitest run "app/(dashboard)/apprenants/[id]/summary.test.ts"
```
Expected : PASS.

- [ ] **Step 2: Build Next.js (la vérif de référence sur ce repo — `pnpm typecheck` n'est pas vert)**

Run:
```bash
cd /Users/anissa/i-a-infinity-of/apps/web && pnpm build 2>&1 | tail -25
```
Expected : `Compiled successfully` / build terminé sans erreur sur la route `/apprenants/[id]`. Si une erreur de type provient d'une variante `Button` ou d'un nom de prop UI, corriger en s'alignant sur l'usage existant (cf. notes Task 5/6), puis re-builder.

- [ ] **Step 3: Anti-doublon de fin (coordination)**

Run:
```bash
cd /Users/anissa/i-a-infinity-of && git fetch origin -q && git log origin/main --oneline -10 && git show origin/main:"apps/web/app/(dashboard)/apprenants/page.tsx" | grep -n 'href="#"' && echo "ATTENTION: origin/main a encore le stub (OK, c'est notre changement)" || echo "OK"
```
Expected : confirmer qu'aucune autre instance n'a déjà créé `apprenants/[id]` sur `origin/main` entre-temps. Si collision → fusionner manuellement.

- [ ] **Step 4: Mettre à jour le claim + push**

Dans `docs/coordination/CLAIMS.md`, passer le statut de la ligne `Opus (fiche-apprenant)` de `actif` à `prêt à merger`. Puis :

```bash
cd /Users/anissa/i-a-infinity-of && git add docs/coordination/CLAIMS.md && git commit -m "chore(coord): fiche apprenant prête à merger" && git push origin feature/fiche-detail-apprenant
```

- [ ] **Step 5: Ouvrir la PR**

```bash
cd /Users/anissa/i-a-infinity-of && gh pr create --base main --head feature/fiche-detail-apprenant --title "feat(apprenants): fiche détail apprenant (hub + dossiers)" --body "Fiche /apprenants/[id] : synthèse (formations, heures, assiduité, dossiers à risque) + grille de cards dossiers vers /dossiers/[id]. Édition identité (updateLearner). Réutilise AnonymizeAction. Sans migration."
```

---

## Hors périmètre (suivi explicite)

- **Back-link `← Apprenant` sur la page dossier** : reporté — `app/(dashboard)/dossiers/**` est une **zone chaude** (1 instance à la fois). À faire dans un lot dédié après avoir claimé la zone dossier. Le retour se fait pour l'instant via le navigateur.
- Sous-pages thématiques transversales (`/apprenants/[id]/documents`, `/sessions`…).
- Actions par-dossier sur la fiche apprenant (déjà disponibles sur les pages dossier).

---

## Self-Review (effectué)

- **Couverture spec** : route + débranchement stub (Task 7/8), accès données sans migration (Task 7), `buildLearnerSummary` pur testé (Task 2), UI header + cards + empty state (Task 4/6/7), actions niveau apprenant — `updateLearner` (Task 3/5), `AnonymizeAction` réutilisé (Task 6), bandeau RGPD + `notFound()` (Task 7), vérif via `pnpm build` (Task 9). Back-link dossier déplacé en hors-périmètre (zone chaude) — écart documenté et assumé.
- **Placeholders** : aucun TODO/TBD ; tout le code est fourni. Deux notes d'adaptation (variantes `Button`, props `StatCard`) renvoient à un fichier existant précis à vérifier au moment d'écrire — ce ne sont pas des placeholders de logique.
- **Cohérence des types** : `LearnerDossier`/`LearnerSummary`/`normalizeOne` définis en Task 2 et réutilisés à l'identique en Task 4/6/7 ; `UpdateLearnerInput` défini en Task 3 et consommé en Task 5.
