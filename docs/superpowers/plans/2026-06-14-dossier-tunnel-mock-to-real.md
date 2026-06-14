# Migration tunnel dossier mock → réel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher la liste `/dossiers` et l'aperçu `/dossiers/[id]` sur Supabase (au lieu de `shared/mock/data`) et semer un dossier réel sous l'org de l'utilisateur, pour supprimer le 404 du tunnel dossier.

**Architecture:** Le `[id]/layout.tsx` interroge déjà `app.dossiers` et `notFound()` si absent — c'est lui le gate réel. Le 404 vient de ce que la **liste** distribue des ids mock (`d-1`) que ce layout rejette. On migre liste + aperçu en Server Components lisant Supabase sous RLS (scoping org via claim JWT), avec une logique de mapping/filtre pure extraite et testée. Le seed est étendu pour cibler l'org réel de l'utilisateur.

**Tech Stack:** Next.js 14 App Router (RSC), Supabase JS (`supabaseServer()`, schéma `app`), Vitest, TailwindCSS.

**Spec :** [docs/superpowers/specs/2026-06-14-dossier-tunnel-mock-to-real-design.md](../specs/2026-06-14-dossier-tunnel-mock-to-real-design.md)

---

## Prérequis (à valider AVANT toute conclusion fonctionnelle)

Le claim JWT `organization_id` doit exister, sinon RLS ne renvoie rien et le 404 persiste malgré le code correct. Vérifier l'un de :
- Décoder le cookie `sb-…-auth-token` d'une session prod (jwt.io) → présence de `organization_id`.
- Supabase Cloud → Authentication → Hooks → Custom Access Token activé sur `app.before_token_emit`.

Ce n'est **pas** une tâche de code ; c'est une condition de réussite documentée.

## Note pré-vol (collision parallèle)

Avant de créer la branche : `git fetch origin && git log --oneline -3 origin/main && gh pr list --state open`. Confirmer qu'aucune session parallèle n'a migré `dossiers/page.tsx` ou `dossiers/[id]/page.tsx` (le 2026-06-14 : non, restent mock). Si une PR les touche désormais, s'arrêter et réaligner.

## Structure des fichiers

| Fichier | Rôle | Action |
|---|---|---|
| `apps/web/features/dossier/dossier-list-view.ts` | Mapping ligne Supabase → item de liste + filtre recherche (pur, testable) | Créer |
| `apps/web/features/dossier/dossier-list-view.test.ts` | Tests Vitest du mapping/filtre | Créer |
| `apps/web/app/(dashboard)/dossiers/page.tsx` | Liste dossiers en données réelles | Remplacer |
| `apps/web/app/(dashboard)/dossiers/[id]/page.tsx` | Aperçu dossier (cartes) en données réelles | Remplacer |
| `apps/web/app/api/admin/seed-demo/route.ts` | Seed ciblé `?org=` + GET liste orgs + lien `session_dossiers` | Modifier |

---

## Task 0 : Branche de travail

**Files:** aucun (git).

- [ ] **Step 1 : Mettre à jour et brancher depuis origin/main**

Run :
```bash
cd /Users/anissa/i-a-infinity-of
git fetch origin
git log --oneline -3 origin/main
gh pr list --state open
git switch -c feature/dossier-tunnel-real
```
Expected : branche `feature/dossier-tunnel-real` créée (incluant le commit de spec `8963185`). Aucune PR ouverte ne touche `dossiers/page.tsx` / `dossiers/[id]/page.tsx`.

---

## Task 1 : Helpers de liste purs (TDD)

**Files:**
- Create: `apps/web/features/dossier/dossier-list-view.ts`
- Test: `apps/web/features/dossier/dossier-list-view.test.ts`

Logique pure (zéro import `next`/`supabase`/`react`) conforme à la règle « domain layer pur » de CLAUDE.md.

- [ ] **Step 1 : Écrire le test qui échoue**

Create `apps/web/features/dossier/dossier-list-view.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import {
  toDossierListItem,
  matchesQuery,
  type DossierListRow,
} from './dossier-list-view';

const baseRow: DossierListRow = {
  id: 'uuid-1',
  reference: 'DEMO-2026-001',
  status: 'active',
  start_date: '2026-09-01',
  end_date: '2026-12-15',
  total_amount_cents: 90000,
  qualiopi_ready: false,
  learner: { first_name: 'Marie', last_name: 'Curie' },
  company: { name: 'Acme SAS' },
  formation: { title: 'Compta TPE' },
  formation_snapshot: { title: 'Snap TPE' },
};

describe('toDossierListItem', () => {
  it('compose le nom complet de l’apprenant', () => {
    expect(toDossierListItem(baseRow).learnerName).toBe('Marie Curie');
  });
  it('met learnerName à "—" sans apprenant', () => {
    expect(toDossierListItem({ ...baseRow, learner: null }).learnerName).toBe('—');
  });
  it('préfère la jointure formation au snapshot', () => {
    expect(toDossierListItem(baseRow).formationTitle).toBe('Compta TPE');
  });
  it('retombe sur le titre du snapshot si la jointure formation est nulle', () => {
    expect(
      toDossierListItem({ ...baseRow, formation: null }).formationTitle,
    ).toBe('Snap TPE');
  });
  it('met companyName à null sans entreprise', () => {
    expect(toDossierListItem({ ...baseRow, company: null }).companyName).toBeNull();
  });
  it('somme les bloquants entrée+clôture depuis la checklist', () => {
    const item = toDossierListItem(baseRow, {
      dossier_id: 'uuid-1',
      satisfied_indicators: 18,
      total_indicators: 24,
      entry_blocking_missing: 2,
      closing_blocking_missing: 1,
    });
    expect(item.qualiopiBlocking).toBe(3);
    expect(item.qualiopiSatisfied).toBe(18);
    expect(item.qualiopiTotal).toBe(24);
  });
  it('laisse les champs qualiopi à null sans checklist', () => {
    const item = toDossierListItem(baseRow);
    expect(item.qualiopiBlocking).toBeNull();
    expect(item.qualiopiSatisfied).toBeNull();
  });
});

describe('matchesQuery', () => {
  const item = toDossierListItem(baseRow);
  it('matche sur la référence, insensible à la casse', () => {
    expect(matchesQuery(item, 'demo-2026')).toBe(true);
  });
  it('matche sur le nom apprenant', () => {
    expect(matchesQuery(item, 'curie')).toBe(true);
  });
  it('matche sur le titre formation', () => {
    expect(matchesQuery(item, 'compta')).toBe(true);
  });
  it('ne matche pas un terme absent', () => {
    expect(matchesQuery(item, 'zzz')).toBe(false);
  });
  it('retourne tout pour une requête vide', () => {
    expect(matchesQuery(item, '')).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `cd apps/web && pnpm exec vitest run features/dossier/dossier-list-view.test.ts`
Expected : FAIL — `Cannot find module './dossier-list-view'`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Create `apps/web/features/dossier/dossier-list-view.ts` :
```ts
// Mapping pur ligne Supabase `app.dossiers` (jointures PostgREST) → item de
// liste, + filtre de recherche. Aucune dépendance framework (testable isolé).

export type DossierListRow = {
  id: string;
  reference: string;
  status: string;
  start_date: string;
  end_date: string;
  total_amount_cents: number | null;
  qualiopi_ready: boolean;
  learner: { first_name: string; last_name: string } | null;
  company: { name: string } | null;
  formation: { title: string } | null;
  formation_snapshot?: { title?: string } | null;
};

export type ChecklistSummary = {
  dossier_id: string;
  satisfied_indicators: number;
  total_indicators: number;
  entry_blocking_missing: number;
  closing_blocking_missing: number;
};

export type DossierListItem = {
  id: string;
  reference: string;
  status: string;
  startDate: string;
  endDate: string;
  totalAmountCents: number | null;
  learnerName: string;
  companyName: string | null;
  formationTitle: string;
  qualiopiReady: boolean;
  qualiopiSatisfied: number | null;
  qualiopiTotal: number | null;
  qualiopiBlocking: number | null;
};

export function toDossierListItem(
  row: DossierListRow,
  checklist?: ChecklistSummary,
): DossierListItem {
  const learnerName =
    [row.learner?.first_name, row.learner?.last_name].filter(Boolean).join(' ') || '—';
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    totalAmountCents: row.total_amount_cents,
    learnerName,
    companyName: row.company?.name ?? null,
    formationTitle: row.formation?.title ?? row.formation_snapshot?.title ?? '—',
    qualiopiReady: row.qualiopi_ready,
    qualiopiSatisfied: checklist?.satisfied_indicators ?? null,
    qualiopiTotal: checklist?.total_indicators ?? null,
    qualiopiBlocking: checklist
      ? checklist.entry_blocking_missing + checklist.closing_blocking_missing
      : null,
  };
}

export function matchesQuery(item: DossierListItem, q: string): boolean {
  if (!q) return true;
  const hay = `${item.reference} ${item.learnerName} ${item.formationTitle}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : `cd apps/web && pnpm exec vitest run features/dossier/dossier-list-view.test.ts`
Expected : PASS (11 tests).

- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/dossier/dossier-list-view.ts apps/web/features/dossier/dossier-list-view.test.ts
git commit -m "feat(dossier): helpers purs mapping+filtre liste (TDD)"
```

---

## Task 2 : Liste `/dossiers` en données réelles

**Files:**
- Modify (remplacement complet): `apps/web/app/(dashboard)/dossiers/page.tsx`

Conserve markup, filtres, avatars, empty state « aucun résultat ». Ajoute un empty state « org sans dossier ». Charge tous les dossiers (RLS-scopé, N modeste), filtre statut + `q` en mémoire (parité exacte avec le comportement mock).

- [ ] **Step 1 : Remplacer le fichier**

Replace `apps/web/app/(dashboard)/dossiers/page.tsx` par :
```tsx
// ARCHETYPE: command
// Justification: liste de gestion en données réelles — header, filtres, lignes confortables.

import Link from 'next/link';
import { Plus, X, Search, FolderOpen } from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import {
  toDossierListItem,
  matchesQuery,
  type DossierListRow,
  type ChecklistSummary,
} from '@/features/dossier/dossier-list-view';

const STATUSES = ['draft', 'pending_validation', 'scheduled', 'active', 'completed', 'closed', 'archived', 'cancelled'] as const;

type SearchParams = { q?: string; status?: string | string[] };

const formatEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

export default async function DossiersPage({ searchParams }: { searchParams: SearchParams }) {
  const q = (searchParams.q ?? '').toLowerCase();
  const statuses = Array.isArray(searchParams.status) ? searchParams.status : searchParams.status ? [searchParams.status] : [];

  const sb = supabaseServer();
  const { data: rows } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, reference, status, start_date, end_date, total_amount_cents, qualiopi_ready, ' +
        'formation_snapshot, learner:learners(first_name, last_name), company:companies(name), formation:formations(title)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossierRows = ((rows as any[]) ?? []) as DossierListRow[];
  const ids = dossierRows.map((r) => r.id);

  const { data: checklistRows } = ids.length
    ? await sb
        .schema('app')
        .from('qualiopi_dossier_checklists')
        .select('dossier_id, satisfied_indicators, total_indicators, entry_blocking_missing, closing_blocking_missing')
        .in('dossier_id', ids)
    : { data: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistById = new Map<string, ChecklistSummary>(((checklistRows as any[]) ?? []).map((c) => [c.dossier_id, c]));

  const allItems = dossierRows.map((r) => toDossierListItem(r, checklistById.get(r.id)));
  const filtered = allItems.filter((d) => {
    if (statuses.length && !statuses.includes(d.status)) return false;
    return matchesQuery(d, q);
  });

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-10">
      <header className="flex items-end justify-between mb-8">
        <div>
          <SectionLabel className="mb-2">Tous les dossiers</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Dossiers</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
            {filtered.length !== allItems.length && (
              <span className="text-zinc-400"> · sur {allItems.length} au total</span>
            )}
          </p>
        </div>
        <Link
          href="/dossiers/nouveau"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau dossier
        </Link>
      </header>

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <form action="/dossiers" method="get" className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="search"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Rechercher une référence, un apprenant…"
            className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md pl-9 pr-3 py-2 text-[13px] w-80 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
          />
          {statuses.map((s) => (
            <input key={s} type="hidden" name="status" value={s} />
          ))}
        </form>

        {statuses.map((s) => {
          const remaining = statuses.filter((x) => x !== s);
          const params = new URLSearchParams();
          if (q) params.set('q', q);
          remaining.forEach((r) => params.append('status', r));
          return (
            <Link
              key={s}
              href={`/dossiers?${params.toString()}`}
              className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 rounded-full px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
            >
              {dossierStatusLabel(s)}
              <X className="w-3 h-3" />
            </Link>
          );
        })}

        <div className="ml-auto flex items-center gap-1 text-[11px]">
          <span className="text-zinc-500 dark:text-zinc-400 mr-1">Filtrer:</span>
          {STATUSES.map((s) => {
            const isOn = statuses.includes(s);
            const next = isOn ? statuses.filter((x) => x !== s) : [...statuses, s];
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            next.forEach((r) => params.append('status', r));
            return (
              <Link
                key={s}
                href={`/dossiers?${params.toString()}`}
                className={
                  isOn
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 rounded-md transition'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2.5 py-1 rounded-md transition'
                }
              >
                {dossierStatusLabel(s)}
              </Link>
            );
          })}
        </div>
      </div>

      {allItems.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
          <EmptyState
            icon={FolderOpen}
            title="Aucun dossier dans cette organisation."
            description="Créez votre premier dossier pour démarrer le suivi Qualiopi."
            action={
              <Link
                href="/dossiers/nouveau"
                className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] px-3 py-1.5 rounded-md transition inline-flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" /> Nouveau dossier
              </Link>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
          <EmptyState
            icon={FolderOpen}
            title="Aucun dossier ne correspond à vos filtres."
            description="Essayez d'élargir la recherche, ou réinitialisez les filtres pour voir tout."
            action={
              <Link
                href="/dossiers"
                className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-2"
              >
                Réinitialiser les filtres
              </Link>
            }
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_140px_1fr_120px_120px_90px_100px] gap-3 py-2.5 px-4 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
            <div>Réf.</div>
            <div>Apprenant</div>
            <div>Entreprise</div>
            <div>Formation</div>
            <div>Période</div>
            <div className="text-right">Montant</div>
            <div>Qualiopi</div>
            <div>Statut</div>
          </div>
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {filtered.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dossiers/${d.id}`}
                  className="grid grid-cols-[110px_1fr_140px_1fr_120px_120px_90px_100px] gap-3 py-3 px-4 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition items-center"
                >
                  <div><IdPill>{d.reference}</IdPill></div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={d.learnerName} />
                    <span className="text-zinc-900 dark:text-zinc-100 truncate">{d.learnerName}</span>
                  </div>
                  <div className="text-zinc-500 dark:text-zinc-400 truncate">{d.companyName ?? '—'}</div>
                  <div className="text-zinc-700 dark:text-zinc-300 truncate">{d.formationTitle}</div>
                  <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {format(parseISO(d.startDate), 'dd/MM/yy')} → {format(parseISO(d.endDate), 'dd/MM/yy')}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 text-right tabular-nums">
                    {formatEuros(d.totalAmountCents)}
                  </div>
                  <div>
                    <span className={
                      d.qualiopiBlocking != null && d.qualiopiBlocking > 0
                        ? 'text-[11px] text-amber-600 dark:text-amber-500 font-mono'
                        : d.qualiopiReady
                        ? 'text-[11px] text-emerald-600 dark:text-emerald-500 font-mono'
                        : 'text-[11px] text-zinc-500 dark:text-zinc-400 font-mono'
                    }>
                      {d.qualiopiSatisfied != null ? `${d.qualiopiSatisfied}/${d.qualiopiTotal}` : '—/—'}
                    </span>
                  </div>
                  <div>
                    <StatusPill tone={dossierStatusTone(d.status)}>
                      {dossierStatusLabel(d.status)}
                    </StatusPill>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const palette = ['bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${palette[idx]}`}>
      {initials}
    </span>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation/types**

Run : `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "dossiers/page|dossier-list-view" || echo "no errors on touched files"`
Expected : `no errors on touched files` (le repo a un bruit tsc connu ailleurs ; on ne valide que les fichiers touchés ; le build complet est en Task 5).

- [ ] **Step 3 : Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/page.tsx"
git commit -m "feat(dossier): liste /dossiers en données réelles (Supabase, RLS)"
```

---

## Task 3 : Aperçu `/dossiers/[id]` en données réelles

**Files:**
- Modify (remplacement complet): `apps/web/app/(dashboard)/dossiers/[id]/page.tsx`

Le `[id]/layout.tsx` rend déjà l'en-tête (réf, statut, apprenant, période, montant, modalité) + la nav d'onglets — **ne pas dupliquer**. Cette page rend uniquement les cartes + le callout. Timeline d'activité **retirée**.

- [ ] **Step 1 : Remplacer le fichier**

Replace `apps/web/app/(dashboard)/dossiers/[id]/page.tsx` par :
```tsx
// ARCHETYPE: command
// Justification: vue 360 d'un dossier en données réelles — cards d'aperçu, callout si bloquant.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowUpRight, ShieldAlert, ShieldCheck, FileText, Calendar, ClipboardList,
  Users as UsersIcon, Banknote,
} from 'lucide-react';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';

const formatEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default async function DossierOverviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const id = params.id;

  const { data: dossier } = await sb
    .schema('app').from('dossiers')
    .select('status, total_amount_cents').eq('id', id).maybeSingle();
  if (!dossier) notFound();
  const status = (dossier as { status: string }).status;
  const totalAmountCents = (dossier as { total_amount_cents: number | null }).total_amount_cents;

  // Chaque requête est prod-safe : data null → carte vide.
  const { data: modules } = await sb.schema('app').from('dossier_modules')
    .select('id, title_snapshot, duration_hours, position').eq('dossier_id', id)
    .order('position', { ascending: true });

  const { data: links } = await sb.schema('app').from('session_dossiers')
    .select('session_id').eq('dossier_id', id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionIds = ((links as any[]) ?? []).map((l) => l.session_id);
  const { data: sessions } = sessionIds.length
    ? await sb.schema('app').from('sessions')
        .select('id, title, modality, status, starts_at').in('id', sessionIds)
        .order('starts_at', { ascending: true })
    : { data: [] };

  const { data: checklist } = await sb.schema('app').from('qualiopi_dossier_checklists')
    .select('satisfied_indicators, total_indicators, entry_blocking_missing, closing_blocking_missing, details')
    .eq('dossier_id', id).maybeSingle();

  const { data: trainers } = await sb.schema('app').from('dossier_trainers')
    .select('trainer:trainers(first_name, last_name)').eq('dossier_id', id);

  const { data: funders } = await sb.schema('app').from('dossier_funders')
    .select('amount_cents, funder:funders(name)').eq('dossier_id', id);

  const { count: documentsCount } = await sb.schema('app').from('documents')
    .select('id', { count: 'exact', head: true }).eq('dossier_id', id);

  const { count: questionnairesCount } = await sb.schema('app').from('questionnaire_assignments')
    .select('id', { count: 'exact', head: true }).eq('dossier_id', id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleRows = (modules as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRows = (sessions as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trainerRows = (trainers as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const funderRows = (funders as any[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (checklist as any) ?? {};
  const qualiopiSatisfied = c.satisfied_indicators ?? 0;
  const qualiopiTotal = c.total_indicators ?? 0;
  const qualiopiBlockingCount = (c.entry_blocking_missing ?? 0) + (c.closing_blocking_missing ?? 0);
  const qualiopiReady = !!checklist && qualiopiBlockingCount === 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blockers = (((c.details as any[]) ?? []).filter((d) => d.is_blocking && !d.satisfied)) as { number: number }[];

  return (
    <div className="space-y-8">
      {status === 'completed' && blockers.length > 0 && (
        <InfoCallout tone="warning">
          <p className="font-medium mb-1">
            Clôture bloquée — {blockers.length} indicateur{blockers.length > 1 ? 's' : ''} Qualiopi à résoudre.
          </p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            {blockers.slice(0, 5).map((b) => `#${b.number}`).join(', ')} non satisfait{blockers.length > 1 ? 's' : ''}.{' '}
            <Link href={`/dossiers/${id}/qualiopi`} className="underline">
              Voir le détail Qualiopi
            </Link>
          </p>
        </InfoCallout>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={ClipboardList} title="Modules" count={moduleRows.length} href={`/dossiers/${id}/modules`}>
          {moduleRows.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Aucun module pour l'instant.{' '}
              <Link href={`/dossiers/${id}/modules`} className="text-zinc-700 dark:text-zinc-300 hover:underline">
                Ajouter un module
              </Link>
            </p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {moduleRows.slice(0, 4).map((m) => (
                <li key={m.id} className="flex justify-between gap-3 items-center">
                  <span className="text-zinc-700 dark:text-zinc-300 truncate min-w-0">
                    <span className="font-mono text-[11px] text-zinc-400 mr-2">{m.position + 1}.</span>
                    {m.title_snapshot}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 flex-shrink-0 tabular-nums">
                    {Number(m.duration_hours)} h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={Calendar} title="Sessions" count={sessionRows.length} href={`/dossiers/${id}/sessions`}>
          {sessionRows.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucune session planifiée.</p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {sessionRows.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 w-20 flex-shrink-0">
                    {fmtDateTime(s.starts_at)}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 flex-1 min-w-0 truncate">
                    {s.title ?? s.modality}
                  </span>
                  <StatusPill tone={s.status === 'done' ? 'success' : s.status === 'in_progress' ? 'warning' : 'info'}>
                    {s.status === 'done' ? 'fait' : s.status === 'in_progress' ? 'en cours' : 'à venir'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          icon={qualiopiReady ? ShieldCheck : ShieldAlert}
          iconTone={qualiopiReady ? 'success' : 'warning'}
          title="Qualiopi"
          href={`/dossiers/${id}/qualiopi`}
        >
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-2xl font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{qualiopiSatisfied}</p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">/ {qualiopiTotal} indicateurs</p>
          </div>
          {!checklist ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Checklist pas encore calculée.</p>
          ) : blockers.length > 0 ? (
            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
              {blockers.slice(0, 3).map((b) => (
                <li key={b.number} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="font-mono text-amber-700 dark:text-amber-400">#{b.number}</span>
                  <span className="truncate">indicateur bloquant</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">Tous les indicateurs sont satisfaits.</p>
          )}
        </Card>

        <Card icon={FileText} title="Documents" count={documentsCount ?? 0} href={`/dossiers/${id}/documents`}>
          {(documentsCount ?? 0) === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucun document généré.</p>
          ) : (
            <p className="text-[13px] text-zinc-700 dark:text-zinc-300">{documentsCount} document(s).</p>
          )}
        </Card>

        <Card icon={UsersIcon} title="Formateurs">
          {trainerRows.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucun formateur affecté.</p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {trainerRows.map((t, i) => (
                <li key={i} className="text-zinc-700 dark:text-zinc-300">
                  {[t.trainer?.first_name, t.trainer?.last_name].filter(Boolean).join(' ') || '—'}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={Banknote} title="Financement">
          {funderRows.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucun financeur.</p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {funderRows.map((f, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{f.funder?.name ?? '—'}</span>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{formatEuros(f.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="font-mono text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mt-1.5 tabular-nums">
            {formatEuros(totalAmountCents)}
          </p>
        </Card>

        <Card icon={ClipboardList} title="Questionnaires" count={questionnairesCount ?? 0} href={`/dossiers/${id}/questionnaires`}>
          {(questionnairesCount ?? 0) === 0 ? (
            <p className="text-[13px] text-zinc-500">Pas encore de questionnaires.</p>
          ) : (
            <p className="text-[13px] text-zinc-700 dark:text-zinc-300">{questionnairesCount} questionnaire(s).</p>
          )}
        </Card>

        <Card icon={Banknote} title="Facturation" href={`/dossiers/${id}/facturation`}>
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
            {status === 'closed'
              ? 'Facture émise'
              : status === 'completed'
              ? 'À émettre à la clôture'
              : 'Pas encore facturable'}
          </p>
          <p className="font-mono text-[11px] text-zinc-500 mt-1">HT {formatEuros(totalAmountCents)}</p>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon: Icon,
  iconTone = 'neutral',
  title,
  count,
  children,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTone?: 'neutral' | 'success' | 'warning';
  title: string;
  count?: number;
  children: React.ReactNode;
  href?: string;
}) {
  const iconColor = iconTone === 'success'
    ? 'text-emerald-600 dark:text-emerald-400'
    : iconTone === 'warning'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-zinc-400 dark:text-zinc-500';
  const iconBg = iconTone === 'success'
    ? 'bg-emerald-50 dark:bg-emerald-950/40'
    : iconTone === 'warning'
    ? 'bg-amber-50 dark:bg-amber-950/40'
    : 'bg-zinc-100 dark:bg-zinc-800/60';
  return (
    <div className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-5 py-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
          </span>
          <h2 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
            {title}
            {typeof count === 'number' && (
              <span className="text-zinc-400 dark:text-zinc-500 ml-1.5 font-normal tabular-nums">{count}</span>
            )}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="text-[11px] text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 transition"
            aria-label={`Voir le détail ${title}`}
          >
            Détail <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2 : Vérifier la compilation/types des fichiers touchés**

Run : `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "dossiers/\[id\]/page" || echo "no errors on overview page"`
Expected : `no errors on overview page`.

- [ ] **Step 3 : Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/page.tsx"
git commit -m "feat(dossier): aperçu /dossiers/[id] en données réelles (cartes), timeline retirée"
```

---

## Task 4 : Seed ciblé sur l'org de l'utilisateur

**Files:**
- Modify: `apps/web/app/api/admin/seed-demo/route.ts`

Trois changements : (a) GET listant les orgs ; (b) POST acceptant `?org=<uuid>` pour cibler une org existante (skip création org Démo) ; (c) insertion `session_dossiers` après les sessions.

- [ ] **Step 1 : Ajouter le handler GET (liste des orgs)**

Dans `apps/web/app/api/admin/seed-demo/route.ts`, après la fonction `admin()` (ligne ~12, avant `export async function POST`), insérer :
```ts
// GET : liste les orgs existantes pour récupérer l'organization_id cible.
// Protégé par CRON_SECRET. Usage : /api/admin/seed-demo?secret=<CRON_SECRET>
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = admin();
  const { data, error } = await sb
    .schema('app')
    .from('organizations')
    .select('id, name, slug')
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'orgs_list_failed', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ organizations: data ?? [] });
}
```

- [ ] **Step 2 : Cibler l'org via `?org=` dans le POST**

Dans `export async function POST`, remplacer le bloc « 1. Organization "Démo" » (actuellement lignes ~22-58, de `// 1. Organization "Démo"` jusqu'à la fermeture du `else` qui set `orgName`) par :
```ts
  // 1. Organization cible.
  // Si ?org=<uuid> fourni : on sème dans cette org existante (cas réel — l'org
  // doit correspondre au claim JWT de l'utilisateur pour que RLS rende visible).
  // Sinon : org "Démo" isolée (back-compat / smoke test).
  const targetOrgParam = req.nextUrl.searchParams.get('org');
  let orgId: string;
  let orgName: string;

  if (targetOrgParam) {
    const { data: targetOrg } = await sb
      .schema('app')
      .from('organizations')
      .select('id, name')
      .eq('id', targetOrgParam)
      .maybeSingle();
    if (!targetOrg) {
      return NextResponse.json({ error: 'org_not_found', details: targetOrgParam }, { status: 400 });
    }
    orgId = (targetOrg as { id: string }).id;
    orgName = (targetOrg as { name: string }).name;
  } else {
    const orgSlug = 'demo-formation-ia-infinity';
    const { data: existingOrg } = await sb
      .schema('app')
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .maybeSingle();

    if (existingOrg) {
      orgId = (existingOrg as { id: string }).id;
      orgName = (existingOrg as { name: string }).name;
    } else {
      const { data: newOrg, error: orgErr } = await sb
        .schema('app')
        .from('organizations')
        .insert({
          slug: orgSlug,
          name: 'Démo Formation',
          legal_name: 'Démo Formation SAS',
          siret: '00000000000000',
          declaration_activite: '11 75 00000 75',
          contact_email: 'demo@i-a-infinity.com',
          contact_phone: '+33 1 23 45 67 89',
          address: { line1: '12 rue de la République', postal_code: '75011', city: 'Paris', country: 'France' },
        })
        .select('id, name')
        .single();
      if (orgErr || !newOrg) {
        return NextResponse.json({ error: 'org_create_failed', details: orgErr?.message }, { status: 500 });
      }
      orgId = (newOrg as { id: string }).id;
      orgName = (newOrg as { name: string }).name;
    }
  }
```

- [ ] **Step 3 : Lier les sessions au dossier via `session_dossiers`**

Dans le bloc « 5. 2 sessions », repérer le `if (sessionsCreated && sessionsCreated.length > 0) {` qui insère les `session_participants`. Juste **avant** l'insertion des participants (à l'intérieur de ce `if`), ajouter le lien `session_dossiers` :
```ts
      // Lien dossier ↔ session (lu par l'onglet Sessions et la carte Sessions).
      const sessionDossierRows = sessionsCreated.map((s) => ({
        session_id: (s as { id: string }).id,
        dossier_id: dossierId,
        organization_id: orgId,
      }));
      await sb.schema('app').from('session_dossiers').insert(sessionDossierRows);

```

- [ ] **Step 4 : Vérifier les types du fichier seed**

Run : `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "seed-demo" || echo "no errors on seed route"`
Expected : `no errors on seed route`.

- [ ] **Step 5 : Commit**

```bash
git add "apps/web/app/api/admin/seed-demo/route.ts"
git commit -m "feat(seed): ciblage org via ?org=, GET liste orgs, lien session_dossiers"
```

---

## Task 5 : Vérification finale & livraison

**Files:** aucun (build + git + manuel).

- [ ] **Step 1 : Suite unitaire**

Run : `cd apps/web && pnpm exec vitest run features/dossier/dossier-list-view.test.ts`
Expected : PASS (11 tests).

- [ ] **Step 2 : Build complet (gate de types/compilation)**

Run : `cd /Users/anissa/i-a-infinity-of && pnpm build`
Expected : `✓ Compiled successfully` / build Next terminé sans erreur. (Le `pnpm typecheck` global n'est jamais vert sur ce repo — le build fait foi.)

- [ ] **Step 3 : Push branche + PR**

```bash
cd /Users/anissa/i-a-infinity-of
git push -u origin feature/dossier-tunnel-real
gh pr create --fill --title "Tunnel dossier : liste + aperçu en données réelles (fix 404)"
```
Expected : PR créée. (Cohérent avec le flux PR du repo — cf. PR #5. Merge vers main = déploiement Railway.)

- [ ] **Step 4 : Vérification manuelle en prod (post-déploiement)**

1. Confirmer le prérequis auth hook (cf. section Prérequis) — claim `organization_id` présent.
2. Récupérer l'org cible : `curl -s "https://i-a-infinity-formation.up.railway.app/api/admin/seed-demo?secret=<CRON_SECRET>"` → copier l'`id` de **ton** org (celle de ton claim JWT).
3. Semer : `curl -s -X POST "https://i-a-infinity-formation.up.railway.app/api/admin/seed-demo?secret=<CRON_SECRET>&org=<TON_ORG_UUID>"` → réponse `ok: true` + `dossier.id`.
4. Ouvrir `/dossiers` connecté → le dossier `DEMO-2026-001` apparaît → cliquer → aperçu réel (2 sessions) → cliquer **Qualiopi** → **plus de 404**.

Expected : navigation complète sans 404 ; carte Sessions affiche 2.

---

## Self-Review (couverture spec)

- **Composant 1 (liste réelle)** → Task 2 ✓ (+ helpers Task 1).
- **Composant 2 (aperçu réel, cartes branchées, timeline retirée)** → Task 3 ✓.
- **Composant 3 (seed `?org=`, GET orgs, session_dossiers)** → Task 4 ✓.
- **Prérequis auth hook** → section dédiée + Task 5 Step 4.1 ✓.
- **Vérification (build + manuel)** → Task 5 ✓.
- **Types cohérents** : `DossierListRow`/`ChecklistSummary`/`DossierListItem` définis en Task 1, consommés à l'identique en Task 2. Colonnes Supabase vérifiées dans les migrations (0007 dossiers, 0010+0049 checklists, 0009 documents, 0011 questionnaire_assignments, 0052 session_dossiers).
- **Hors périmètre** (wizard persistant, onglets mock restants, flux événements) : non planifié, conforme à la spec.
