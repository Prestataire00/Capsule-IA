# Formulaire de création de formation (forme/logique SoSafe) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Rendre fonctionnel le formulaire de création/édition de formation dans `i-a-infinity-of`, en reprenant la forme (5 sections accordéon) et la logique de SoSafe, scope adapté.

**Architecture:** Composant client RHF + Zod partagé. Mapping des champs connus → colonnes `app.formations`, le reste → `metadata.catalog` (JSONB). Server Actions `'use server'` calquées sur `createTrainer` (auth + `resolveAdminOrgId` + `supabaseAdmin().schema('app')`). **Aucune migration.**

**Tech Stack:** Next.js 14 App Router, react-hook-form + @hookform/resolvers, Zod, Supabase, Tailwind (FormField/inputClass existants), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-15-formation-form-sosafe-design.md` (liste exhaustive des champs par section — y faire référence).

---

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `apps/web/features/formations/constants.ts` | Enums + labels (modalités, statuts, catégories, financements, types d'action, certif, NSF court, unités). |
| `apps/web/features/formations/formation.schema.ts` | `formationFormSchema` (Zod, tous champs) + type `FormationFormValues` + `emptyFormationValues`. |
| `apps/web/features/formations/mapping.ts` | `toInsert(values, ctx)` / `toUpdate(values)` / `fromRow(row)` + `slugify`. Pur, sans I/O. |
| `apps/web/features/formations/mapping.test.ts` | Round-trip `fromRow(toInsert(...))`, slugify, €→cents. |
| `apps/web/features/formations/actions.ts` | `createFormation` / `updateFormation` (`'use server'`, Result union). |
| `apps/web/shared/ui/accordion-section.tsx` | Section repliable client. |
| `apps/web/shared/ui/rich-text.tsx` | Éditeur contentEditable + mini-barre, intégrable RHF (value/onChange). |
| `apps/web/features/formations/ui/formation-form.tsx` | Formulaire client (5 sections), create + edit. |
| `apps/web/app/(dashboard)/formations/nouvelle/page.tsx` | Monte `<FormationForm mode="create">`. |
| `apps/web/app/(dashboard)/formations/[id]/edit/page.tsx` | Charge la formation → `<FormationForm mode="edit" initial=… formationId=…>`. |
| `apps/web/app/(dashboard)/formations/[id]/page.tsx` | Ajout bouton « Modifier » → `/formations/[id]/edit`. |

---

## Task 1 — Constantes catalogue
**Files:** Create `apps/web/features/formations/constants.ts`
- [ ] Définir `MODALITIES` (`presentiel|distanciel|hybride|afest`), `STATUSES` (`draft|published|archived`), `PROGRAM_CATEGORIES` (liste courte Qualiopi), `FUNDING_TYPES`, `ACTION_TYPES` (BPF), `CERTIF_TYPES` (`rncp|rs|cqp|sans`), `VALIDITY_UNITS`, `NSF_CODES` (sous-ensemble). Chacun `{value,label}` + `as const`.
- [ ] Commit.

## Task 2 — Schema Zod + valeurs vides
**Files:** Create `apps/web/features/formations/formation.schema.ts`
- [ ] `formationFormSchema` : `title` requis (min 1), `durationHours` `z.coerce.number().positive()`, `priceBase` `z.coerce.number().min(0)`, modalité enum, statut enum ; tous les autres champs optionnels (string `''`, number coerce, booleans, arrays). Champs listes (`objectives`, `prerequisites`, `categories`, `fundingTypes`) en `string[]`.
- [ ] Exporter `type FormationFormValues = z.infer<…>` et `emptyFormationValues: FormationFormValues`.
- [ ] Commit.

## Task 3 — Mapping (TDD)
**Files:** Create `mapping.ts` + `mapping.test.ts`
- [ ] **Test d'abord** : `slugify('FORM Compta 01') === 'form-compta-01'` ; `toInsert(values,{orgId,userId})` met `default_price_cents = priceBase*100`, `is_published = status==='published'`, range les extras dans `metadata.catalog` ; `fromRow(toInsert(v,ctx) as Row)` redonne les champs saisis (tolérance arrays/strings). Run `pnpm --filter web test mapping` → FAIL.
- [ ] Implémenter `slugify`, `toInsert`, `toUpdate`, `fromRow`. Colonnes directes selon spec ; reste → `metadata.catalog`. Run test → PASS.
- [ ] Commit.

## Task 4 — Primitives UI
**Files:** Create `shared/ui/accordion-section.tsx`, `shared/ui/rich-text.tsx`
- [ ] `AccordionSection` (`'use client'`) : props `title`, `defaultOpen`, `children`, `icon?` ; toggle `useState`, chevron, style cohérent (border, rounded-xl, header cliquable).
- [ ] `RichText` (`'use client'`) : `value:string` (HTML), `onChange(html)`, barre gras/italique/puces via `document.execCommand`, `contentEditable` non contrôlé (init via ref, `onInput` → onChange), `inputClass`-like. Fallback : tape du HTML simple.
- [ ] Commit.

## Task 5 — Server Actions
**Files:** Create `apps/web/features/formations/actions.ts`
- [ ] Calquer `createTrainer` : `supabaseServer().auth.getUser()` → `resolveAdminOrgId(user.id)` (réutiliser même logique members/role) → `formationFormSchema.safeParse(values)` → `supabaseAdmin().schema('app').from('formations').insert(toInsert(...))` → `revalidatePath('/formations')`. Retour `{ok:true,id} | {ok:false,error,details?}`. Gérer l'erreur d'unicité `(organization_id, code/slug)` → `error:'code_already_exists'`.
- [ ] `updateFormation(id, values)` : même garde + `.update(toUpdate(...)).eq('id',id)` ; charge la row existante pour fusionner `metadata`.
- [ ] Commit.

## Task 6 — Formulaire
**Files:** Create `apps/web/features/formations/ui/formation-form.tsx`
- [ ] `'use client'` + `// ARCHETYPE: workflow`. `useForm<FormationFormValues>({resolver: zodResolver(formationFormSchema), defaultValues: initial ?? emptyFormationValues})`.
- [ ] 5 `AccordionSection` (section 1 ouverte) avec tous les champs de la spec : `register` pour inputs simples, `Controller` pour `RichText`, multi-selects et switches. Champs conditionnels : relance si `recyclingEnabled`, bloc France Compétences si `certifying||qualifying` (watch).
- [ ] Listes (`objectives`,`prerequisites`,`categories`,`fundingTypes`) : objectives/prerequisites en textarea « une ligne = un item » (transform split/join) ; categories/fundingTypes en multi-checkbox.
- [ ] Submit : `useTransition` → `mode==='create' ? createFormation(values) : updateFormation(formationId, values)`. Succès → `router.push('/formations')`. Erreur → message inline (`code_already_exists` → « Ce code existe déjà »).
- [ ] Footer Annuler/Enregistrer (même markup que page actuelle).
- [ ] Commit.

## Task 7 — Pages
**Files:** Modify `formations/nouvelle/page.tsx`, Create `formations/[id]/edit/page.tsx`, Modify `formations/[id]/page.tsx`
- [ ] `nouvelle/page.tsx` : remplacer le `<form get>` par header + `<FormationForm mode="create" />`.
- [ ] `[id]/edit/page.tsx` : server component, charge la formation (toutes colonnes + metadata) via `supabaseServer().schema('app')`, `notFound()` si absente, `fromRow` → `<FormationForm mode="edit" formationId={id} initial={values} />`.
- [ ] `[id]/page.tsx` : ajouter un lien « Modifier » vers `/formations/[id]/edit` dans l'entête.
- [ ] Commit.

## Task 8 — Vérification
- [ ] `pnpm --filter web test` (mapping/schema) → PASS.
- [ ] `pnpm --filter web build` → succès (typecheck jamais vert sur ce repo, on valide via build).
- [ ] Commit éventuel de correctifs.

## Task 9 — Intégration
- [ ] `git fetch` + re-lire `CLAIMS.md` (anti-doublon de fin).
- [ ] Push branche + PR. Libérer le claim (statut `mergé`) au merge.

---

## Self-review (couverture spec)
- Sections 1–5 : Tasks 1/2/6. Mapping colonnes/metadata : Task 3/5. Conditionnels recyclage/certif : Task 6. Slug auto + unicité : Task 3/5. Édition : Task 5/7. Tests : Task 3/8. Hors-scope (section inscription, modules, catégories dynamiques) : non implémenté, conforme spec.
