# Multi-modalité sur le dossier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de sélectionner plusieurs modalités sur un dossier (additif), via une colonne `dossiers.modalities[]`, en conservant `modality` scalaire comme primaire — sans casser les 53 consommateurs existants.

**Architecture:** Colonne tableau d'enum additive + backfill + CHECK d'invariant ; helpers purs (dérivation primaire + schéma Zod) ; composant UI multi-select ; convention PDF listant l'ensemble. Touche uniquement `app.dossiers` → orthogonal à la session parallèle (`sessions`).

**Tech Stack:** Postgres (ALTER + CHECK, pgTAP), TypeScript + Zod, pdf-lib (convention), Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-06-13-dossier-multi-modalite-design.md`

---

## File Structure

**Créés :**
- `supabase/migrations/0055_dossier_modalities.sql` — colonne + backfill + CHECK.
- `supabase/tests/0055_test_dossier_modalities.sql` — pgTAP (CHECK + backfill).
- `apps/web/features/dossier/modality-set.ts` — `MODALITIES`, `derivePrimaryModality` (pur), `ModalitiesSchema` (Zod).
- `apps/web/features/dossier/modality-set.test.ts` — vitest.
- `apps/web/features/dossier/ui/modality-multi-select.tsx` — composant multi-select.

**Modifiés :**
- `apps/web/features/documents/generate-convention-pdf.ts` — `ConventionInput.dossier.modalities?` + rendu liste.
- `apps/web/app/api/dossiers/[id]/convention.pdf/route.ts` — passe `modalities` dans l'input.

## Faits de codebase

- Enum `app.training_modality = ('presentiel','distanciel','hybride','afest')` (0002).
- `app.dossiers.modality app.training_modality NOT NULL` (0007). 53 consommateurs scalaires (domaine `dossier.entity`, events, PDF, pages) → **inchangés** (on garde le scalaire primaire).
- Type front `Modality` : `apps/web/shared/mock/data.ts:21`. VO domaine : `apps/web/features/dossier/domain/value-objects/training-modality.ts` (`TrainingModalityValues`, `isTrainingModality`).
- Convention : `modalityLabel(m)` (ligne 70) + `drawKeyValue(..., 'Modalité', modalityLabel(input.dossier.modality))` (ligne 202) ; `ConventionInput.dossier.modality: string`.
- **Domaine pur** (red line #3) : pas de `zod` dans `features/dossier/domain/**` → le schéma Zod va dans `features/dossier/modality-set.ts` (hors `domain/`).
- Numéros choisis **hauts** (`0055`) pour éviter collision avec PR #1-#3 (0043-0051) et la session parallèle. Vérifier le prochain libre réel à l'exécution.
- ⚠️ Docker durablement indisponible → migration/pgTAP en write-only/PENDING ; Vitest fonctionne. `pnpm typecheck` jamais vert (gater sur « pas de nouvelle erreur sur mes fichiers » hors `@/env.mjs`).
- ⚠️ Formulaire dossier **en mock** → le composant multi-select est livré mais son branchement bout-en-bout dépend de la migration des pages dossier (hors périmètre).

---

## Task 1 : Migration `0055_dossier_modalities.sql` (write-only)

**Files:** Create `supabase/migrations/0055_dossier_modalities.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- ============================================================================
-- 0055 — Multi-modalité sur le dossier (additif)
-- ============================================================================
-- modality (scalaire) reste la modalité PRIMAIRE. modalities[] porte l'ensemble.
-- Invariant : la primaire appartient à l'ensemble.
-- ============================================================================

ALTER TABLE app.dossiers
  ADD COLUMN modalities app.training_modality[] NOT NULL DEFAULT '{}';

-- Backfill : refléter le scalaire existant
UPDATE app.dossiers SET modalities = ARRAY[modality] WHERE cardinality(modalities) = 0;

ALTER TABLE app.dossiers
  ADD CONSTRAINT ck_dossiers_modality_in_set
  CHECK (cardinality(modalities) = 0 OR modality = ANY(modalities));

COMMENT ON COLUMN app.dossiers.modalities IS
  'Ensemble des modalités du dossier ; app.dossiers.modality = modalité primaire (1ʳᵉ choisie).';
```

- [ ] **Step 2 : Replay (Docker requis ; sinon PENDING)** — `pnpm db:reset`. Expected : succès ; `\d app.dossiers` montre `modalities`.
- [ ] **Step 3 : Commit**

```bash
git add supabase/migrations/0055_dossier_modalities.sql
git commit -m "feat(dossier): colonne modalities[] additive + backfill + CHECK invariant"
```

---

## Task 2 : pgTAP — CHECK + backfill (write-only)

**Files:** Create `supabase/tests/0055_test_dossier_modalities.sql`

- [ ] **Step 1 : Écrire le test**

```sql
-- ============================================================================
-- Tests pgTAP : dossiers.modalities — backfill + CHECK invariant
-- ============================================================================
BEGIN;
SELECT plan(3);

SELECT tests.as_service_role();

INSERT INTO app.organizations (id, name, legal_name, siret) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OF A', 'OF A SARL', '11111111111111');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email) VALUES
  ('1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Lea', 'A', 'lea@of.test');

-- Un dossier scalaire 'presentiel' (modalities prend le DEFAULT '{}' à l'insert,
-- puis on simule le backfill comme la migration le fait)
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, status, modality, start_date, end_date, total_hours)
SELECT 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DOS-MM-1', '1ea00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa', f.id, 'draft', 'presentiel', now()::date, now()::date, 1
  FROM app.formations f WHERE f.organization_id = '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' LIMIT 1;
UPDATE app.dossiers SET modalities = ARRAY[modality] WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND cardinality(modalities) = 0;

SELECT is(
  (SELECT modalities FROM app.dossiers WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ARRAY['presentiel']::app.training_modality[],
  'Backfill : modalities reflète le scalaire');

-- Mettre un ensemble valide incluant la primaire : OK
UPDATE app.dossiers SET modalities = ARRAY['presentiel','distanciel']::app.training_modality[]
  WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT cardinality(modalities) FROM app.dossiers WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  2, 'Ensemble valide accepté (primaire incluse)');

-- Primaire hors ensemble : rejeté par le CHECK
SELECT throws_ok(
  $$ UPDATE app.dossiers SET modalities = ARRAY['distanciel','afest']::app.training_modality[]
     WHERE id = 'd0a00000-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514',
  NULL,
  'CHECK rejette une primaire (presentiel) hors de modalities');

SELECT * FROM finish();
ROLLBACK;
```

> Note : si `app.dossiers` a des colonnes NOT NULL supplémentaires, compléter l'INSERT en lisant `0007_dossier.sql`. S'il n'existe pas de formation pour l'org, en insérer une minimale d'abord.

- [ ] **Step 2 : Lancer** — `pnpm db:test` (PENDING si Docker down).
- [ ] **Step 3 : Commit**

```bash
git add supabase/tests/0055_test_dossier_modalities.sql
git commit -m "test(dossier): pgTAP backfill + CHECK invariant modalities"
```

---

## Task 3 : Helpers purs + Zod (TDD Vitest)

**Files:** Create `apps/web/features/dossier/modality-set.ts` + `modality-set.test.ts`

- [ ] **Step 1 : Test (échoue d'abord)**

```ts
import { describe, it, expect } from 'vitest';
import { MODALITIES, derivePrimaryModality, ModalitiesSchema } from './modality-set';

describe('MODALITIES', () => {
  it('contient les 4 valeurs de l\'enum', () => {
    expect(MODALITIES).toEqual(['presentiel', 'distanciel', 'hybride', 'afest']);
  });
});

describe('derivePrimaryModality', () => {
  it('renvoie la première modalité (primaire)', () => {
    expect(derivePrimaryModality(['distanciel', 'presentiel'])).toBe('distanciel');
  });
  it('jette si l\'ensemble est vide', () => {
    expect(() => derivePrimaryModality([])).toThrow();
  });
});

describe('ModalitiesSchema', () => {
  it('accepte 1 à 4 modalités valides', () => {
    expect(ModalitiesSchema.safeParse(['presentiel']).success).toBe(true);
    expect(ModalitiesSchema.safeParse(['presentiel', 'afest']).success).toBe(true);
  });
  it('rejette un ensemble vide', () => {
    expect(ModalitiesSchema.safeParse([]).success).toBe(false);
  });
  it('rejette une valeur inconnue', () => {
    expect(ModalitiesSchema.safeParse(['mixte']).success).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer pour échec** — `pnpm --filter web test modality-set` → FAIL.
- [ ] **Step 3 : Implémenter**

```ts
import { z } from 'zod';

export const MODALITIES = ['presentiel', 'distanciel', 'hybride', 'afest'] as const;
export type Modality = (typeof MODALITIES)[number];

export function derivePrimaryModality(modalities: readonly Modality[]): Modality {
  const first = modalities[0];
  if (!first) throw new Error('modalities_empty');
  return first;
}

export const ModalitiesSchema = z.array(z.enum(MODALITIES)).min(1).max(4);
```

- [ ] **Step 4 : Lancer pour succès** — `pnpm --filter web test modality-set` → PASS.
- [ ] **Step 5 : Commit**

```bash
git add apps/web/features/dossier/modality-set.ts apps/web/features/dossier/modality-set.test.ts
git commit -m "feat(dossier): helpers modalités (MODALITIES, derivePrimaryModality, ModalitiesSchema)"
```

---

## Task 4 : Composant UI multi-select

**Files:** Create `apps/web/features/dossier/ui/modality-multi-select.tsx`

- [ ] **Step 1 : Implémenter le composant**

```tsx
'use client';

import { cn } from '@/shared/lib/cn';
import { MODALITIES, type Modality } from '@/features/dossier/modality-set';

const LABELS: Record<Modality, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

// Multi-sélection des modalités. La 1ʳᵉ de `value` est la primaire (badge).
export function ModalityMultiSelect({
  value,
  onChange,
}: {
  value: Modality[];
  onChange: (next: Modality[]) => void;
}) {
  const toggle = (m: Modality) => {
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {MODALITIES.map((m) => {
        const active = value.includes(m);
        const isPrimary = value[0] === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] border transition',
              active
                ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
                : 'bg-white dark:bg-zinc-900 border-zinc-200/60 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300',
            )}
          >
            {LABELS[m]}
            {isPrimary && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500 text-white">primaire</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep modality-multi-select` → vide (ou seulement `@/env.mjs` si applicable). Confirmer que `cn` existe (`@/shared/lib/cn`).
- [ ] **Step 3 : Commit**

```bash
git add apps/web/features/dossier/ui/modality-multi-select.tsx
git commit -m "feat(dossier): composant ModalityMultiSelect (multi-sélection + badge primaire)"
```

> Branchement dans le formulaire dossier : PENDING (le formulaire est en mock). Quand il sera réel, importer `ModalityMultiSelect`, lier à un champ `modalities`, et dériver `modality = derivePrimaryModality(modalities)` avant `save_dossier`.

---

## Task 5 : Convention PDF — liste des modalités

**Files:** Modify `apps/web/features/documents/generate-convention-pdf.ts` + `apps/web/app/api/dossiers/[id]/convention.pdf/route.ts`

- [ ] **Step 1 : Lire** `generate-convention-pdf.ts` autour des lignes 40-72 et 202 (type `ConventionInput.dossier`, helper `modalityLabel`, appel `drawKeyValue`).

- [ ] **Step 2 : Étendre `ConventionInput`** — ajouter `modalities?: string[]` dans `dossier` (champ optionnel, rétrocompatible) :

```ts
  dossier: {
    // ... champs existants ...
    modality: string;
    modalities?: string[];
    // ...
  };
```

- [ ] **Step 3 : Rendu liste** — remplacer l'appel ligne ~202 :

```ts
  const modalitiesText =
    input.dossier.modalities && input.dossier.modalities.length > 1
      ? input.dossier.modalities.map(modalityLabel).join(', ')
      : modalityLabel(input.dossier.modality);
  c = drawKeyValue(doc, c, font, fontBold, 'Modalité', modalitiesText);
```

- [ ] **Step 4 : Route** — dans `convention.pdf/route.ts`, ajouter `modalities` au `select` du dossier et au mapping de l'input :
  - ajouter `modalities` dans la chaîne `.select('... modality, modalities, ...')` ;
  - dans le type local `d` : `modalities: string[] | null` ;
  - passer `modalities: d.modalities ?? undefined` dans `input.dossier`.

- [ ] **Step 5 : Typecheck delta** — `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "generate-convention-pdf|convention.pdf/route"` → seules erreurs tolérées : `@/env.mjs`.
- [ ] **Step 6 : Commit**

```bash
git add apps/web/features/documents/generate-convention-pdf.ts "apps/web/app/api/dossiers/[id]/convention.pdf/route.ts"
git commit -m "feat(convention): liste des modalités quand le dossier en a plusieurs"
```

---

## Task 6 : Vérification finale

- [ ] **Step 1 : Suite TS** — `pnpm --filter web test` → vert (dont `modality-set`). `pnpm --filter web exec tsc --noEmit 2>&1 | grep -E "features/dossier|generate-convention|convention.pdf" | grep -v env.mjs` → aucune nouvelle erreur réelle.
- [ ] **Step 2 : DB (si Docker dispo)** — `pnpm db:reset && pnpm db:test && pnpm db:types` → migration rejouée, pgTAP 0055 vert, types régénérés (`dossiers.modalities` apparaît). Sinon PENDING.
- [ ] **Step 3 : Golden path manuel** — (quand le formulaire dossier sera réel) cocher plusieurs modalités → dossier enregistré avec `modalities` + `modality` primaire → convention liste « Présentiel, Distanciel ». En attendant : vérifier le rendu convention en passant un `modalities` de test à `generateConventionPDF`.
- [ ] **Step 4 : Commit final si ajustements** — `git commit -am "chore(dossier): finalisation multi-modalité"`.

---

## Self-Review

**1. Couverture spec :** §4 migration → T1. §8 pgTAP → T2. §5 helpers/Zod → T3. §6 UI → T4. §7 convention → T5. §8 vitest → T3/T5, golden path → T6. Toutes les sections couvertes.

**2. Placeholders :** les renvois « lire le fichier » (T5) concernent l'édition de `generate-convention-pdf.ts` existant, avec le code exact à appliquer. Pas de TBD dans les composants neufs.

**3. Cohérence des types :** `MODALITIES`/`Modality`/`derivePrimaryModality`/`ModalitiesSchema` définis en T3, consommés en T4 (composant) ; `ConventionInput.dossier.modalities?: string[]` ajouté en T5 et alimenté par la route (T5 step 4). `derivePrimaryModality` réutilisé au branchement du formulaire (PENDING, noté T4).

**Risques résiduels :** (a) formulaire dossier en mock → branchement bout-en-bout PENDING (T4) ; (b) numéros `0055` à confirmer libres à l'exécution (PR #1-#3 + session parallèle) ; (c) `dossiers.modalities` absent de `database.ts` jusqu'à `db:types` → cast `as never` si lu côté TS typé entre-temps.
