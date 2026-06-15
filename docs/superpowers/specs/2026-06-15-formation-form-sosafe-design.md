# Formulaire de création de formation — forme & logique SoSafe (scope adapté)

**Date** : 2026-06-15
**Statut** : Design approuvé, à planifier
**Cible** : `i-a-infinity-of` (Capsule IA, Next.js 14 + Supabase)
**Référence** : `Sosafe-formation/client/src/pages/programs.tsx` (formulaire `ProgramForm`)

## Contexte & problème

La page `app/(dashboard)/formations/nouvelle/page.tsx` existe mais n'est qu'un **template statique** :
`<form method="get">`, aucune Server Action, pas de schema Zod, pas de résolution
d'`organization_id`, pas de génération de slug. On ne peut donc pas créer de formation
depuis l'UI.

Le formulaire SoSafe de référence est riche (6 sections accordéon, ~66 champs, table
`programs` à 67 colonnes : tarif multi-canal, BPF, France Compétences, recyclage,
config champs d'inscription Digiforma). La table cible `app.formations` est nettement
plus simple (~24 colonnes).

**Décision (validée)** : reprendre la **forme et la logique** SoSafe (sections accordéon,
logique conditionnelle), **scope adapté** à Capsule IA. Les champs SoSafe sans colonne
dédiée sont stockés dans `metadata` JSONB → **aucune nouvelle colonne** au départ. On
promeut un champ en colonne réelle plus tard seulement si on a besoin de le filtrer/indexer.

## Scope

**Inclus** : sections 1 à 5 de SoSafe (infos générales, type d'action & certification,
contenu pédagogique, évaluation, accessibilité & contact), en création **et** édition.

**Exclu (assumé)** :
- Section 6 SoSafe « champs d'inscription » (libéral/entreprise/particulier, custom fields) —
  relève de la session/enrollment, pas du catalogue.
- Génération/composition de modules (reste sur `/formations/[id]/modules`).
- Catégories dynamiques en base — liste de constantes au départ.
- Enum `blended` SoSafe : on garde l'enum existant `app.training_modality`
  (`presentiel | distanciel | hybride | afest`).

## Architecture

### Fichiers

| Fichier | Rôle |
|---|---|
| `features/formations/ui/formation.schema.ts` | Schema Zod (tous les champs), types partagés. |
| `features/formations/ui/formation-form.tsx` | Composant client partagé create + edit, sections accordéon. |
| `features/formations/actions.ts` | `createFormation` / `updateFormation` (`authActionClient` + Zod). |
| `features/formations/mapping.ts` | Mapping bidirectionnel champs ⇄ (colonnes + `metadata.catalog`). |
| `shared/ui/accordion-section.tsx` | Section repliable Tailwind légère (pas de shadcn). |
| `shared/ui/rich-text.tsx` | Éditeur WYSIWYG léger (Tiptap) pour champs longs. |
| `app/(dashboard)/formations/nouvelle/page.tsx` | Remplace le template statique → monte `<FormationForm mode="create">`. |
| `app/(dashboard)/formations/[id]/edit/page.tsx` | Charge la formation, monte `<FormationForm mode="edit" initial={…}>`. |

### Structure UI — 5 sections accordéon (section 1 ouverte par défaut)

Co-visibles sur une seule page (fidèle à SoSafe), pas de wizard. Composant
`AccordionSection` réutilisé, primitives `FormField` + `inputClass` existantes,
`RichText` pour les champs longs, `Textarea` pour les champs courts.

**1. Infos générales**
- titre* (input) · sous-titre (input) · code (input, auto-généré si vide) · version (number)
- modalité* (select enum `training_modality`) · durée heures* (number) · durée jours (number)
- effectif min / max (number) · statut (select : brouillon / publié / archivé)
- prix base* (number €) · prix entreprise / particulier / indépendant (number €)
- catégories (multi-select, constantes) · image (URL + upload) · vidéo (URL)
- éligible CPF (checkbox) · publié au catalogue (checkbox)
- lieu / ville / département par défaut (input)

**2. Type d'action & certification**
- type d'action BPF (select) · action DPC (checkbox) · diplôme visé · titre visé (input)
- code NSF (select ou saisie libre) · certifiante (switch) · qualifiante (switch)
- modalités d'obtention (textarea) · détails certification (textarea)
- validité : valeur (number) + unité (select années/mois)
- recyclage (switch) → **conditionnel** : relance valeur (number) + unité (select)
- France Compétences : type (RNCP/RS/CQP/sans) · identifiant émetteur · nom + identifiant
  certificateur · n° contrat · modalité d'accès · modalité d'obtention · date enregistrement ·
  donnée certifiée (checkbox)
- financements possibles (multi-select : FIFPL, OPCO, DPC, France Travail, CPF, Particulier, Autre)

**3. Contenu pédagogique**
- programme détaillé / syllabus (RichText) · objectifs pédagogiques (liste → `objectives[]`)
- public visé (RichText) · méthodes pédagogiques (RichText) · équipe pédagogique (RichText)
- formateur par défaut (select `trainers`) · déroulement (textarea)

**4. Évaluation & résultats**
- modalités d'évaluation (RichText) · indicateurs de résultats (RichText)

**5. Accessibilité & contact**
- prérequis (liste → `prerequisites[]`) · accessibilité handicap (RichText)
- délais et modalités d'accès (textarea) · contact référent (input) · référent handicap (input)

### Logique

- **Validation Zod** : `title` requis, `default_duration_hours > 0`, `default_price_cents >= 0`.
  Le reste optionnel. Coercition number, `prix € × 100 → cents`.
- **Slug** : auto depuis `code` sinon `title` (slugify), unicité `(organization_id, slug)` et
  `(organization_id, code)` — contraintes déjà en base ; gérer l'erreur d'unicité en message clair.
- **Champs conditionnels** : bloc « relance » visible si `recyclage` activé ; bloc France
  Compétences mis en avant si `certifiante || qualifiante` (toujours rendu, jamais bloquant).
- **Soumission** : `useTransition` + Server Action ; succès → toast + `redirect('/formations')`
  + `revalidatePath('/formations')`. Erreur → toast, formulaire conservé.

### Stockage — mapping

**Colonnes `app.formations` (mapping direct)** :
`title, code, slug, summary (= sous-titre), description, objectives[], prerequisites[],
target_audience, evaluation_method, pedagogical_method, default_modality,
default_duration_hours, default_price_cents (= prix base × 100), rncp_code, rs_code,
certificateur, is_published (= statut === 'publié'), organization_id, created_by`.

**`metadata.catalog` (JSONB typé)** — tout le reste :
`subtitle? (aussi mappé sur summary), version, status, durationDays, effectifMin, effectifMax,
priceEntreprise, priceParticulier, priceIndependant, categories[], imageUrl, videoUrl,
eligibleCpf, publishedToCatalog, defaultLocation/City/Department, typeActionFormation, isDpc,
diplomeVise, nomTitreVise, codeNsf, certifying, qualifying, certificationObtention,
certificationDetails, validityValue, validityUnit, recyclingEnabled, recyclingReminderValue,
recyclingReminderUnit, certif* (France Compétences), fundingTypes[], teachingMethods,
teachingTeam, defaultTrainerId, descriptionDeroulement, accessibilityInfo, accessDelay,
resultIndicators, referentContact, referentHandicap, programContent (syllabus HTML)`.

> Note `defaultTrainerId` : stocké dans `metadata` (suggestion par défaut), sans FK dure
> pour l'instant — à promouvoir en colonne si on veut l'intégrité référentielle.

> Note objectifs/prérequis : SoSafe les stocke en HTML riche ; ici on les saisit en **liste**
> (une entrée par ligne) pour respecter `objectives TEXT[]` / `prerequisites TEXT[]`. Le syllabus
> long va dans `metadata.catalog.programContent` (HTML).

`mapping.ts` expose `toRow(formData)` et `fromRow(row)` pour garantir la symétrie create/edit.

## Conventions respectées

- `authActionClient` (next-safe-action) + résolution `organization_id` via JWT, comme
  `createTrainer` (`app/(dashboard)/formateurs/nouveau/actions.ts`).
- Style : `FormField` + `inputClass` (`shared/ui/form-field.tsx`), Tailwind custom, pas de shadcn.
- Archétype fichier : `// ARCHETYPE: workflow` en tête des fichiers de formulaire.
- RLS stricte `app.formations` : insert/update uniquement via Server Action authentifiée.

## Tests

- Unitaire : `mapping.ts` round-trip (`fromRow(toRow(x)) ≈ x`), slugify, € → cents.
- Unitaire : schema Zod (champs requis, bornes, conditionnels recyclage).
- E2E (Playwright) : créer une formation minimale → apparaît dans `/formations` ;
  éditer → valeurs `metadata` rechargées ; erreur d'unicité de code → message.

## Risques / points ouverts

- **Tiptap** : nouvelle dépendance front (éditeur WYSIWYG). Léger, mais à valider au build
  (`next build` — `pnpm typecheck` n'est jamais vert sur ce repo).
- **metadata non typé en base** : la cohérence repose sur `mapping.ts` + Zod, pas sur Postgres.
  Acceptable au scope « léger » ; documenter le shape de `metadata.catalog`.
- **Session parallèle** : `git fetch` + vérifier qu'un moteur catalogue/formation n'a pas été
  construit en parallèle avant de démarrer l'implémentation.
