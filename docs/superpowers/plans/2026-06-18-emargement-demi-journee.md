# Émargement demi-journée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brancher l'émargement par séance sur les vraies données (dashboard + formateur), standardisé sur le modèle demi-journée, avec une UI adaptée à la modalité.

**Architecture:** Les feuilles `attendance_sheets` matin/après-midi sont créées par la RPC idempotente `app.materialize_attendance_slots` (trigger 0082 + appel au chargement). Les pages détail (Server Components) lisent via RLS (`supabaseServer`) et composent les composants client réels déjà présents (`ParticipantsList`, `ZoomImportPanel`, `FinalizeButton`), une instance par feuille demi-journée, filtrés par une fonction pure `panelsForModality`.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Supabase (PostgREST `app` schema, RPC SECURITY DEFINER), TypeScript strict, Vitest, pgTAP.

**Spec :** `docs/superpowers/specs/2026-06-18-emargement-demi-journee-design.md`

**Contexte branche :** worktree `feat/emargement-demi-journee` (zone chaude `features/attendance/**` claimée dans CLAIMS.md).

---

## Faits codebase (vérifiés)

- `app.attendance_sheets` : `id, organization_id, dossier_id, session_id, half_day, status, finalized_at, finalized_by, document_id, created_at, updated_at`. Contrainte unique `(session_id, half_day)`.
- `app.session_participants` : `session_id, organization_id, participant_kind, learner_id, trainer_id, participant_id, is_required, source`.
- `app.attendance_signatures` : `participant_kind, learner_id, trainer_id, status, signed_at, …`.
- `learners` et `trainers` ont `first_name, last_name, email`.
- RPC `app.materialize_attendance_slots(p_session_id uuid) returns int` (idempotente, frontière 13h Europe/Paris ; repli `'full'` si pile 13h ; ne crée rien si une `'full'` existe ; rien si `status='cancelled'`).
- Composants client réels existants (ne PAS réécrire) dans `app/(dashboard)/dossiers/[id]/emargements/[sessionId]/` :
  - `participants-list.tsx` → `<ParticipantsList sheetId participants={ParticipantItem[]} />`, `ParticipantItem = { id, kind:'learner'|'trainer', fullName, email, signed }`.
  - `zoom-import-panel.tsx` → `<ZoomImportPanel sheetId sessionId />`.
  - `finalize-button.tsx` → `<FinalizeButton sheetId initialFinalized initialDocumentId allSigned />`.
- Server Actions réelles existantes dans le même dossier `actions.ts` : `generateParticipantSignatureLink`, `finalizeAttendanceSheet`, `getDocumentDownloadUrl`, `importZoomCsv`. **À supprimer :** `ensureAttendanceSheet` (chemin `'full'` legacy).
- Modalités possibles (enum `app.training_modality`) : `presentiel`, `distanciel`, `hybride`, `afest`.
- `app/(formateur)/mes-sessions/page.tsx` (réel) linke `/emarger/${sessionId}`. `app/(formateur)/emarger/[id]/page.tsx` est mock (179 lignes). `[id]` = session id.
- La liste `app/(dashboard)/dossiers/[id]/emargements/page.tsx` (réelle) n'a PAS de lien vers le détail.

---

## File Structure

- **Create** `apps/web/features/attendance/domain/panels-for-modality.ts` — fonction pure modalité → panneaux.
- **Create** `apps/web/features/attendance/domain/__tests__/panels-for-modality.test.ts` — test Vitest.
- **Create** `apps/web/features/attendance/queries/load-session-emargement.ts` — chargement structuré d'une séance + feuilles + participants + signatures.
- **Modify** `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts` — remplacer `ensureAttendanceSheet` par `ensureSessionSheets` + ajouter `convertLegacyFullSheet`.
- **Create** `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block.tsx` — bloc UI par feuille demi-journée (compose les composants existants).
- **Create** `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/generate-sheets-button.tsx` — bouton empty-state génération/conversion.
- **Rewrite** `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/page.tsx` — de-mock, compose les blocs.
- **Modify** `apps/web/app/(dashboard)/dossiers/[id]/emargements/page.tsx` — lier chaque ligne au détail.
- **Rewrite** `apps/web/app/(formateur)/emarger/[id]/page.tsx` — de-mock (réutilise query + blocs).
- **Create** `supabase/tests/0082_test_materialize_slots.sql` — pgTAP idempotence.

---

## Task 1 : Fonction pure `panelsForModality`

**Files:**
- Create: `apps/web/features/attendance/domain/panels-for-modality.ts`
- Test: `apps/web/features/attendance/domain/__tests__/panels-for-modality.test.ts`

- [ ] **Step 1: Écrire le test (échoue)**

```ts
// apps/web/features/attendance/domain/__tests__/panels-for-modality.test.ts
import { describe, it, expect } from 'vitest';
import { panelsForModality } from '../panels-for-modality';

describe('panelsForModality', () => {
  it('présentiel → signature seule', () => {
    expect(panelsForModality('presentiel')).toEqual({ signature: true, zoom: false });
  });
  it('distanciel → zoom seul', () => {
    expect(panelsForModality('distanciel')).toEqual({ signature: false, zoom: true });
  });
  it('hybride → les deux', () => {
    expect(panelsForModality('hybride')).toEqual({ signature: true, zoom: true });
  });
  it('afest → signature seule', () => {
    expect(panelsForModality('afest')).toEqual({ signature: true, zoom: false });
  });
  it('modalité inconnue → signature seule (repli sûr)', () => {
    expect(panelsForModality('autre')).toEqual({ signature: true, zoom: false });
  });
});
```

- [ ] **Step 2: Lancer le test → échoue**

Run: `cd apps/web && pnpm vitest run features/attendance/domain/__tests__/panels-for-modality.test.ts`
Expected: FAIL (`panelsForModality` introuvable).

- [ ] **Step 3: Implémenter**

```ts
// apps/web/features/attendance/domain/panels-for-modality.ts
// Fonction pure : zéro import next/supabase/react/zod (domain layer).
export type ModalityPanels = { signature: boolean; zoom: boolean };

/**
 * Quels modes de preuve afficher pour une feuille selon la modalité de séance.
 * - présentiel / afest : signature manuscrite (lien/QR)
 * - distanciel : preuve de connexion (import Zoom)
 * - hybride : les deux
 * - inconnu : repli sûr = signature
 */
export const panelsForModality = (modality: string): ModalityPanels => {
  switch (modality) {
    case 'distanciel':
      return { signature: false, zoom: true };
    case 'hybride':
      return { signature: true, zoom: true };
    case 'presentiel':
    case 'afest':
    default:
      return { signature: true, zoom: false };
  }
};
```

- [ ] **Step 4: Lancer le test → passe**

Run: `cd apps/web && pnpm vitest run features/attendance/domain/__tests__/panels-for-modality.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/attendance/domain/panels-for-modality.ts apps/web/features/attendance/domain/__tests__/panels-for-modality.test.ts
git commit -m "feat(attendance): panelsForModality (modalité → modes de preuve)"
```

---

## Task 2 : Actions `ensureSessionSheets` + `convertLegacyFullSheet` (remplace `ensureAttendanceSheet`)

**Files:**
- Modify: `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts`

- [ ] **Step 1: Supprimer `ensureAttendanceSheet`**

Retirer entièrement la fonction `ensureAttendanceSheet` (lignes ~21-55, le bloc `export async function ensureAttendanceSheet(...) { ... }`). Vérifier qu'elle n'est plus importée nulle part :

Run: `cd apps/web && grep -rn "ensureAttendanceSheet" app features` 
Expected: aucun résultat (sinon corriger les imports — la page mock qui l'importait est réécrite en Task 5).

- [ ] **Step 2: Ajouter `ensureSessionSheets` et `convertLegacyFullSheet`**

Ajouter à la fin de `actions.ts` (le helper `admin()` existe déjà en haut du fichier) :

```ts
export type EnsureSheetsResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/** Matérialise (idempotent) les feuilles matin/après-midi de la séance via la RPC. */
export async function ensureSessionSheets(sessionId: string): Promise<EnsureSheetsResult> {
  const sb = admin();
  const { data, error } = await sb
    .schema('app')
    .rpc('materialize_attendance_slots' as never, { p_session_id: sessionId } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: (data as number | null) ?? 0 };
}

export type ConvertLegacyResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * Convertit une feuille 'full' legacy VIERGE (0 signature, non finalisée) en
 * feuilles demi-journée. Refuse si des signatures existent / déjà finalisée
 * (preuve légale intouchable).
 */
export async function convertLegacyFullSheet(sessionId: string): Promise<ConvertLegacyResult> {
  const sb = admin();

  const { data: full } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('half_day', 'full')
    .maybeSingle();
  if (!full) return { ok: false, error: 'no_full_sheet' };
  const fullSheet = full as { id: string; status: string };
  if (fullSheet.status === 'finalized') return { ok: false, error: 'full_sheet_finalized' };

  const { count } = await sb
    .schema('app')
    .from('attendance_signatures')
    .select('*', { count: 'exact', head: true })
    .eq('attendance_sheet_id', fullSheet.id);
  if ((count ?? 0) > 0) return { ok: false, error: 'full_sheet_has_signatures' };

  const { error: delErr } = await sb
    .schema('app')
    .from('attendance_sheets')
    .delete()
    .eq('id', fullSheet.id);
  if (delErr) return { ok: false, error: delErr.message };

  const { data, error } = await sb
    .schema('app')
    .rpc('materialize_attendance_slots' as never, { p_session_id: sessionId } as never);
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: (data as number | null) ?? 0 };
}
```

- [ ] **Step 3: Vérifier la compilation des actions**

Run: `cd apps/web && pnpm vitest run features/attendance/domain/__tests__/panels-for-modality.test.ts` (sanity, suite verte) puis `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "emargements/\[sessionId\]/actions" || echo "OK actions"`
Expected: `OK actions` (pas d'erreur TS sur ce fichier ; le typecheck global peut rester rouge ailleurs — cf. mémoire projet).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts"
git commit -m "feat(attendance): ensureSessionSheets + convertLegacyFullSheet, drop ensureAttendanceSheet 'full'"
```

---

## Task 3 : Query `load-session-emargement`

**Files:**
- Create: `apps/web/features/attendance/queries/load-session-emargement.ts`

- [ ] **Step 1: Implémenter la query**

```ts
// apps/web/features/attendance/queries/load-session-emargement.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HalfDay } from '@/features/attendance/domain/half-day';
import type { ParticipantItem } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/participants-list';

export type SheetView = {
  id: string;
  halfDay: HalfDay;
  finalized: boolean;
  documentId: string | null;
  participants: ParticipantItem[];
  allSigned: boolean;
};

export type SessionEmargementView = {
  session: {
    id: string;
    dossierId: string;
    organizationId: string;
    title: string | null;
    startsAt: string;
    endsAt: string;
    modality: string;
    location: string | null;
  };
  sheets: SheetView[];
} | null;

const HALF_DAY_ORDER: Record<string, number> = { morning: 0, afternoon: 1, full: 2, evening: 3 };

type ParticipantRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  learner: { first_name: string; last_name: string; email: string | null } | null;
  trainer: { first_name: string; last_name: string; email: string | null } | null;
};
type SignatureRow = {
  participant_kind: 'learner' | 'trainer';
  learner_id: string | null;
  trainer_id: string | null;
  signed_at: string | null;
};
type SheetRow = {
  id: string;
  half_day: HalfDay;
  status: string;
  finalized_at: string | null;
  document_id: string | null;
  signatures: SignatureRow[] | null;
};

/** Charge la séance + ses feuilles demi-journée + participants + état de signature. */
export async function loadSessionEmargement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  sessionId: string,
): Promise<SessionEmargementView> {
  const { data: sessionData } = await sb
    .schema('app')
    .from('sessions')
    .select('id, dossier_id, organization_id, title, starts_at, ends_at, modality, location')
    .eq('id', sessionId)
    .maybeSingle();
  if (!sessionData) return null;
  const s = sessionData as {
    id: string; dossier_id: string; organization_id: string; title: string | null;
    starts_at: string; ends_at: string; modality: string; location: string | null;
  };

  const [{ data: sheetsData }, { data: partsData }] = await Promise.all([
    sb
      .schema('app')
      .from('attendance_sheets')
      .select('id, half_day, status, finalized_at, document_id, signatures:attendance_signatures(participant_kind, learner_id, trainer_id, signed_at)')
      .eq('session_id', sessionId),
    sb
      .schema('app')
      .from('session_participants')
      .select('participant_kind, learner_id, trainer_id, learner:learners(first_name,last_name,email), trainer:trainers(first_name,last_name,email)')
      .eq('session_id', sessionId),
  ]);

  const parts = ((partsData ?? []) as unknown as ParticipantRow[]).map((p) => {
    const isLearner = p.participant_kind === 'learner';
    const person = isLearner ? p.learner : p.trainer;
    return {
      id: (isLearner ? p.learner_id : p.trainer_id) ?? '',
      kind: p.participant_kind,
      fullName: person ? `${person.first_name} ${person.last_name}` : 'Participant inconnu',
      email: person?.email ?? null,
    };
  });

  const sheets: SheetView[] = ((sheetsData ?? []) as unknown as SheetRow[])
    .map((sheet) => {
      const sigs = sheet.signatures ?? [];
      const isSigned = (kind: 'learner' | 'trainer', id: string) =>
        sigs.some(
          (g) => g.participant_kind === kind && (kind === 'learner' ? g.learner_id : g.trainer_id) === id && g.signed_at != null,
        );
      const participants: ParticipantItem[] = parts.map((p) => ({
        id: p.id,
        kind: p.kind,
        fullName: p.fullName,
        email: p.email,
        signed: p.id !== '' && isSigned(p.kind, p.id),
      }));
      return {
        id: sheet.id,
        halfDay: sheet.half_day,
        finalized: sheet.finalized_at != null || sheet.status === 'finalized',
        documentId: sheet.document_id,
        participants,
        allSigned: participants.length > 0 && participants.every((p) => p.signed),
      };
    })
    .sort((a, b) => (HALF_DAY_ORDER[a.halfDay] ?? 9) - (HALF_DAY_ORDER[b.halfDay] ?? 9));

  return {
    session: {
      id: s.id, dossierId: s.dossier_id, organizationId: s.organization_id, title: s.title,
      startsAt: s.starts_at, endsAt: s.ends_at, modality: s.modality, location: s.location,
    },
    sheets,
  };
}
```

- [ ] **Step 2: Vérifier la compilation du fichier**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "load-session-emargement" || echo "OK query"`
Expected: `OK query`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/features/attendance/queries/load-session-emargement.ts
git commit -m "feat(attendance): query load-session-emargement (séance + feuilles + signatures)"
```

---

## Task 4 : Composant `HalfDaySheetBlock`

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block.tsx`

- [ ] **Step 1: Implémenter le bloc**

```tsx
// apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block.tsx
import { ParticipantsList } from './participants-list';
import { ZoomImportPanel } from './zoom-import-panel';
import { FinalizeButton } from './finalize-button';
import { panelsForModality } from '@/features/attendance/domain/panels-for-modality';
import type { SheetView } from '@/features/attendance/queries/load-session-emargement';

const HALF_DAY_LABELS: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full: 'Journée',
  evening: 'Soirée',
};

export function HalfDaySheetBlock({
  sheet,
  sessionId,
  modality,
}: {
  sheet: SheetView;
  sessionId: string;
  modality: string;
}) {
  const panels = panelsForModality(modality);
  const signedCount = sheet.participants.filter((p) => p.signed).length;

  return (
    <section className="border border-zinc-200/60 dark:border-zinc-800 rounded-2xl p-4 space-y-3 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          {HALF_DAY_LABELS[sheet.halfDay] ?? sheet.halfDay}
        </h2>
        <span className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400">
          {signedCount}/{sheet.participants.length} signé{sheet.participants.length > 1 ? 's' : ''}
        </span>
      </header>

      {panels.signature && <ParticipantsList sheetId={sheet.id} participants={sheet.participants} />}
      {panels.zoom && <ZoomImportPanel sheetId={sheet.id} sessionId={sessionId} />}

      <FinalizeButton
        sheetId={sheet.id}
        initialFinalized={sheet.finalized}
        initialDocumentId={sheet.documentId}
        allSigned={sheet.allSigned}
      />
    </section>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "half-day-sheet-block" || echo "OK block"`
Expected: `OK block`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block.tsx"
git commit -m "feat(attendance): HalfDaySheetBlock (composants réels, panneaux par modalité)"
```

---

## Task 5 : Bouton génération empty-state + de-mock page détail dashboard

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/generate-sheets-button.tsx`
- Rewrite: `apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/page.tsx`

- [ ] **Step 1: Bouton client de génération/conversion**

```tsx
// apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/generate-sheets-button.tsx
'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarPlus } from 'lucide-react';
import { ensureSessionSheets, convertLegacyFullSheet } from './actions';

export function GenerateSheetsButton({ sessionId, hasLegacyFull }: { sessionId: string; hasLegacyFull: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    start(async () => {
      const r = hasLegacyFull ? await convertLegacyFullSheet(sessionId) : await ensureSessionSheets(sessionId);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="text-center space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarPlus className="w-4 h-4" />}
        {hasLegacyFull ? 'Convertir en feuilles matin / après-midi' : "Générer les feuilles d'émargement"}
      </button>
      {error && <p className="text-[12px] text-red-600 font-mono">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Réécrire la page détail (de-mock)**

```tsx
// apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/page.tsx
// ARCHETYPE: command
// Justification: feuille d'émargement réelle d'une séance — vue gestionnaire, une feuille par demi-journée.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { ensureSessionSheets } from './actions';
import { HalfDaySheetBlock } from './half-day-sheet-block';
import { GenerateSheetsButton } from './generate-sheets-button';

export const dynamic = 'force-dynamic';

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

export default async function EmargementSessionPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  // Idempotent : garantit l'existence des feuilles demi-journée (séances anciennes incluses).
  await ensureSessionSheets(params.sessionId);

  const view = await loadSessionEmargement(supabaseServer(), params.sessionId);
  if (!view) notFound();

  const { session, sheets } = view;
  const hasLegacyFull = sheets.length === 1 && sheets[0]?.halfDay === 'full';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={`/dossiers/${params.id}/emargements`}
        className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
      >
        ← Toutes les feuilles
      </Link>

      <header>
        <SectionLabel className="mb-1">Émargement</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {session.title ?? 'Séance'}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {format(parseISO(session.startsAt), 'EEEE d MMMM yyyy', { locale: fr })} ·{' '}
          {format(parseISO(session.startsAt), 'HH:mm', { locale: fr })}–
          {format(parseISO(session.endsAt), 'HH:mm', { locale: fr })} ·{' '}
          {MODALITY_LABELS[session.modality] ?? session.modality}
          {session.location ? ` · ${session.location}` : ''}
        </p>
      </header>

      {sheets.length === 0 ? (
        <div className="border border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl px-6 py-10 space-y-3">
          <p className="text-[14px] text-zinc-700 dark:text-zinc-300 text-center">
            Aucune feuille d&apos;émargement pour cette séance.
          </p>
          <GenerateSheetsButton sessionId={session.id} hasLegacyFull={false} />
        </div>
      ) : (
        <div className="space-y-5">
          {hasLegacyFull && (
            <div className="border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl px-4 py-3 space-y-2">
              <p className="text-[12px] text-amber-800 dark:text-amber-300">
                Feuille unique « journée » (ancien format). Tu peux la convertir en feuilles matin / après-midi
                (uniquement si aucune signature n&apos;a encore été posée).
              </p>
              <GenerateSheetsButton sessionId={session.id} hasLegacyFull />
            </div>
          )}
          {sheets.map((sheet) => (
            <HalfDaySheetBlock key={sheet.id} sheet={sheet} sessionId={session.id} modality={session.modality} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-400">
        L&apos;émargement Qualiopi exige une signature par participant et par demi-journée (indicateur I22).
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier le build**

Run: `cd apps/web && pnpm build 2>&1 | tail -5`
Expected: build OK (route `/dossiers/[id]/emargements/[sessionId]` compilée). Si échec sur `.env.local` manquant dans le worktree : `cp <repo principal>/apps/web/.env.local apps/web/.env.local` puis relancer.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/generate-sheets-button.tsx" "apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/page.tsx"
git commit -m "feat(attendance): de-mock page détail émargement (blocs demi-journée + génération)"
```

---

## Task 6 : Lier les lignes de la liste vers le détail

**Files:**
- Modify: `apps/web/app/(dashboard)/dossiers/[id]/emargements/page.tsx`

- [ ] **Step 1: Exposer l'id de séance dans la projection**

Dans le `.map((row) => {...})` (vers la ligne 33), ajouter `sessionId` à l'objet retourné, à partir de `session` déjà sélectionné :

```ts
      const session = row.session as { id: string; title: string | null; starts_at: string | null } | null;
      // ... dans l'objet retourné, ajouter :
        sessionId: session?.id ?? null,
```

(Le select inclut déjà `session:sessions(id, title, starts_at)`.)

- [ ] **Step 2: Envelopper chaque `<li>` d'un lien vers le détail**

Remplacer le contenu de la `<li>` par un `<Link>` quand `sessionId` existe. Ajouter en tête du fichier `import Link from 'next/link';`, puis dans le `.map` de rendu :

```tsx
            const inner = (
              <div className="grid grid-cols-[140px_1fr_120px_110px] gap-3 py-3 px-1 text-[13px] items-center">
                <span className="font-mono text-[11px] text-zinc-500">{fmtDateTime(s.startsAt)}</span>
                <span className="text-zinc-900 dark:text-zinc-100 truncate">
                  {s.title}
                  <span className="text-zinc-400 dark:text-zinc-500"> · {HALF_DAY_LABELS[s.halfDay] ?? s.halfDay}</span>
                </span>
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {s.signed}/{s.total} signé{s.total > 1 ? 's' : ''}
                </span>
                <StatusPill tone={tone}>{label}</StatusPill>
              </div>
            );
            return (
              <li key={s.id}>
                {s.sessionId ? (
                  <Link
                    href={`/dossiers/${params.id}/emargements/${s.sessionId}`}
                    className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition rounded-lg"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
```

(Adapter le type de l'objet `s` pour inclure `sessionId: string | null` ; supprimer l'ancien `className` du `<li>` désormais porté par `inner`.)

- [ ] **Step 3: Vérifier le build**

Run: `cd apps/web && pnpm build 2>&1 | tail -5`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/emargements/page.tsx"
git commit -m "feat(attendance): lier les feuilles de la liste vers le détail séance"
```

---

## Task 7 : De-mock écran formateur `/emarger/[id]`

**Files:**
- Rewrite: `apps/web/app/(formateur)/emarger/[id]/page.tsx`

- [ ] **Step 1: Réécrire en Server Component réel**

Réutilise `loadSessionEmargement` + `ensureSessionSheets` + `HalfDaySheetBlock`. Le `[id]` est un session id (cohérent avec `mes-sessions`).

```tsx
// apps/web/app/(formateur)/emarger/[id]/page.tsx
// ARCHETYPE: command (mobile-first) — feuille d'émargement live du formateur.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { ensureSessionSheets } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions';
import { HalfDaySheetBlock } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block';

export const dynamic = 'force-dynamic';

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

export default async function FormateurEmargerPage({ params }: { params: { id: string } }) {
  await ensureSessionSheets(params.id);
  const view = await loadSessionEmargement(supabaseServer(), params.id);
  if (!view) notFound();
  const { session, sheets } = view;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link href="/mes-sessions" className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5">
        <ArrowLeft className="w-3 h-3" /> Mes sessions
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {session.title ?? 'Séance'}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {format(parseISO(session.startsAt), 'EEEE d MMMM', { locale: fr })} ·{' '}
          {format(parseISO(session.startsAt), 'HH:mm', { locale: fr })}–
          {format(parseISO(session.endsAt), 'HH:mm', { locale: fr })} ·{' '}
          {MODALITY_LABELS[session.modality] ?? session.modality}
          {session.location ? ` · ${session.location}` : ''}
        </p>
      </header>

      {sheets.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune feuille pour cette séance.</p>
      ) : (
        <div className="space-y-5">
          {sheets.map((sheet) => (
            <HalfDaySheetBlock key={sheet.id} sheet={sheet} sessionId={session.id} modality={session.modality} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Vérifier le build**

Run: `cd apps/web && pnpm build 2>&1 | tail -5`
Expected: build OK (route `/emarger/[id]` compilée, plus d'import `@/shared/mock/data`).

Run: `cd apps/web && grep -rn "shared/mock/data" "app/(formateur)/emarger" "app/(dashboard)/dossiers/[id]/emargements"`
Expected: aucun résultat.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(formateur)/emarger/[id]/page.tsx"
git commit -m "feat(attendance): de-mock écran formateur /emarger (données réelles)"
```

---

## Task 8 : Test pgTAP idempotence `materialize_attendance_slots`

**Files:**
- Create: `supabase/tests/0082_test_materialize_slots.sql`

- [ ] **Step 1: Écrire le test pgTAP**

```sql
-- supabase/tests/0082_test_materialize_slots.sql
BEGIN;
SELECT plan(6);

INSERT INTO app.organizations (id, name, legal_name, siret)
VALUES ('33333333-3333-3333-3333-333333333333', 'OF Slots', 'OF Slots SARL', '00000000000099');

-- Dossier minimal requis par la FK session.dossier_id (adapter si colonnes NOT NULL supplémentaires).
INSERT INTO app.dossiers (id, organization_id, reference, status)
VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'DOS-SLOT', 'draft');

-- Séance 9h-17h (Europe/Paris) → matin + après-midi
INSERT INTO app.sessions (id, organization_id, dossier_id, title, starts_at, ends_at, modality, status)
VALUES ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444', 'Journée complète',
        '2026-09-15 07:00:00+00', '2026-09-15 15:00:00+00', 'presentiel', 'scheduled');

-- Le trigger 0082 a déjà matérialisé à l'INSERT : on vérifie l'état.
SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets WHERE session_id = '55555555-5555-5555-5555-555555555555'),
  2, 'séance 9h-17h → 2 feuilles');
SELECT ok(
  EXISTS (SELECT 1 FROM app.attendance_sheets WHERE session_id='55555555-5555-5555-5555-555555555555' AND half_day='morning'),
  'feuille matin créée');
SELECT ok(
  EXISTS (SELECT 1 FROM app.attendance_sheets WHERE session_id='55555555-5555-5555-5555-555555555555' AND half_day='afternoon'),
  'feuille après-midi créée');

-- Idempotence : re-appel ne crée rien
SELECT is(app.materialize_attendance_slots('55555555-5555-5555-5555-555555555555'), 0,
  'idempotent : second appel crée 0 feuille');

-- Séance après-midi seule (14h-17h Paris)
INSERT INTO app.sessions (id, organization_id, dossier_id, title, starts_at, ends_at, modality, status)
VALUES ('66666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333',
        '44444444-4444-4444-4444-444444444444', 'Après-midi',
        '2026-09-15 12:00:00+00', '2026-09-15 15:00:00+00', 'presentiel', 'scheduled');
SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets WHERE session_id='66666666-6666-6666-6666-666666666666' AND half_day='afternoon'),
  1, 'séance 14h-17h → après-midi seule');
SELECT is(
  (SELECT count(*)::int FROM app.attendance_sheets WHERE session_id='66666666-6666-6666-6666-666666666666' AND half_day='morning'),
  0, 'séance 14h-17h → pas de matin');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: (si Docker/Supabase local dispo) lancer pgTAP**

Run: `pnpm db:test 2>&1 | tail -20`
Expected: `0082_test_materialize_slots` → 6 tests verts.
Note (mémoire projet) : `db:test` exige Supabase local (souvent indispo). Si indispo → marquer la vérification PENDING et valider la cohérence par lecture seule ; ne PAS bloquer le commit.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0082_test_materialize_slots.sql
git commit -m "test(attendance): pgTAP idempotence materialize_attendance_slots"
```

---

## Task 9 : Vérification finale & PR

- [ ] **Step 1: Build complet**

Run: `cd apps/web && pnpm build 2>&1 | tail -8`
Expected: build réussi, aucune route émargement en erreur.

- [ ] **Step 2: Suite Vitest attendance**

Run: `cd apps/web && pnpm vitest run features/attendance 2>&1 | tail -15`
Expected: tous verts (dont `panels-for-modality`).

- [ ] **Step 3: Anti-doublon de fin (coordination)**

Run depuis la racine : `git fetch origin && git log origin/main --oneline -10` puis re-lire `docs/coordination/CLAIMS.md`. Comparer les fichiers touchés à `git show origin/main:<fichier>` (zone chaude attendance). Si collision → rebaser/renuméroter.

- [ ] **Step 4: Pousser et ouvrir la PR**

```bash
git push -u origin feat/emargement-demi-journee
gh pr create --base main --head feat/emargement-demi-journee \
  --title "feat(attendance): émargement demi-journée branché & modality-aware" \
  --body "De-mock émargement par séance (dashboard + formateur), modèle demi-journée standardisé (RPC materialize_attendance_slots), UI par modalité (présentiel=signature, distanciel=Zoom, hybride=les deux, afest=signature), conversion legacy 'full'. Spec + plan dans docs/superpowers. 🤖 Generated with Claude Code"
```

- [ ] **Step 5: Libérer le claim**

Mettre la ligne `feat/emargement-demi-journee` de `docs/coordination/CLAIMS.md` en statut `mergé` après merge de la PR.

---

## Self-Review (auteur du plan)

- **Couverture spec :** modèle demi-journée (T2), de-mock dashboard (T5) + formateur (T7), `HalfDaySheetBlock` (T4), `panelsForModality` (T1), legacy 'full' (T2+T5), génération empty-state (T5), liens liste (T6), erreurs réelles (composants existants remontent déjà `r.error`), tests (T1 Vitest, T8 pgTAP). ✅
- **Pas de placeholder :** code complet à chaque étape ; composants existants réutilisés sans réécriture. ✅
- **Cohérence des types :** `ParticipantItem` (importé depuis `participants-list.tsx`), `SheetView`/`SessionEmargementView` (définis T3, consommés T4/T5/T7), `panelsForModality` signature identique partout. ✅
- **Risque connu :** `pnpm typecheck` jamais vert globalement → on valide via `next build` (mémoire projet). `db:test` exige Docker → vérif pgTAP possiblement PENDING.
