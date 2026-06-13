# Multi-modalité sur le dossier — Design

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Date : 2026-06-13 · Contexte borné : `dossier` (+ `documents` pour la convention).

## 1. Problème

Le champ MODALITÉ du formulaire dossier n'autorise qu'**une seule** valeur (présentiel /
distanciel / hybride / AFEST). Impossible de déclarer un dossier combinant plusieurs modalités
(ex. présentiel + distanciel + AFEST) de façon explicite.

Cause : `app.dossiers.modality` est un **enum scalaire** `app.training_modality`
(migration 0002 : `'presentiel','distanciel','hybride','afest'`), reflété dans le type TS
`Modality` et les options du formulaire. La valeur `hybride` couvre le cas présentiel+distanciel,
mais pas une multi-sélection libre.

## 2. Objectif & périmètre

Permettre de **sélectionner plusieurs modalités** sur un **dossier**, en additif, sans casser
les consommateurs existants.

### Décisions (brainstorming)

| Décision | Choix |
|---|---|
| Cible | **Dossier seulement** (le formulaire concerné ; zéro collision avec la session parallèle qui édite `sessions`) |
| Représentation | **Approche A** — colonne tableau additive `dossiers.modalities[]`, `modality` scalaire conservé comme **primaire** |
| Invariant | la primaire (scalaire) ∈ l'ensemble (`modalities`) |

### Contexte de coordination
Une autre session développe « sessions partagées multi-entreprises » (schéma `sessions` /
`session_dossiers`). Ce design ne touche **que `app.dossiers`** → orthogonal, pas de collision.
Travail à faire en **worktree isolé**, migration à **numéro élevé** (vérifier le prochain libre).

### Hors périmètre (YAGNI)
- Multi-modalité au niveau **session** (sera coordonné avec la session parallèle si besoin).
- Réécriture du domaine : `dossier.entity`/events gardent `modality` scalaire (primaire) ;
  `modalities` est une donnée additive de persistance/UI (53 consommateurs scalaires inchangés).
- Aucune nouvelle valeur d'enum (la demande est de combiner les 4 existantes, pas d'en ajouter).

## 3. Architecture & flux

```
Formulaire dossier (MODALITÉ multi-select) ──► Zod { modalities: [..] (1..4) }
        │  dérive modality = modalities[0] (primaire)
        ▼
save_dossier / command  ──►  app.dossiers { modality (primaire), modalities[] (ensemble) }
        ▼
Convention PDF : liste `modalities` si >1, sinon `modality`
```
Additif : tout consommateur lisant `modality` (scalaire) continue de fonctionner ; l'UI
multi-select et la convention lisent `modalities`.

## 4. Composant — Migration

```sql
ALTER TABLE app.dossiers
  ADD COLUMN modalities app.training_modality[] NOT NULL DEFAULT '{}';

UPDATE app.dossiers SET modalities = ARRAY[modality] WHERE cardinality(modalities) = 0;

ALTER TABLE app.dossiers
  ADD CONSTRAINT ck_dossiers_modality_in_set
  CHECK (cardinality(modalities) = 0 OR modality = ANY(modalities));
```
Numéro de migration : **élevé**, vérifier le prochain libre au plan (les PR ouvertes + la
session parallèle consomment des numéros). Pas de RLS nouvelle (même table, policies héritées).

## 5. Composant — Zod partagé + dérivation primaire

`apps/web/features/dossier/.../modality.ts` (helpers purs) :
- constante `MODALITIES = ['presentiel','distanciel','hybride','afest'] as const`.
- `derivePrimaryModality(modalities: Modality[]): Modality` → `modalities[0]` (lève si vide).
- Schéma `ModalitiesSchema = z.array(z.enum(MODALITIES)).min(1).max(4)` (valeurs distinctes —
  dédup côté form). Partagé form ⇄ action (red line #5).

À l'enregistrement du dossier : écrire `modalities` (ensemble) **et** `modality` (= primaire).

## 6. Composant — UI multi-select

Le champ MODALITÉ unique devient une **multi-sélection** (cases à cocher, ≥1 requis). La 1ʳᵉ
sélectionnée porte un badge « primaire ». Charte v3.

> ⚠️ **Caveat** : le formulaire dossier est **en mock** (mémoire `project_ia_infinity_ui_mock`).
> Migration + schéma + composant sont réels ; le bout-en-bout (saisie → base) ne sera effectif
> qu'une fois le formulaire dossier câblé au vrai backend (chantier séparé). À signaler en PR.

## 7. Composant — Convention PDF

`generate-convention-pdf.ts` : si `modalities.length > 1`, afficher la liste lisible
(« Présentiel, Distanciel »), sinon le scalaire actuel. Rétrocompatible (`ConventionInput`
gagne un champ optionnel `modalities?: string[]`).

## 8. Tests
- **Vitest** : `derivePrimaryModality` (premier élément ; throw si vide) ; `ModalitiesSchema`
  (accepte 1..4, rejette vide ; dédup) ; rendu liste de modalités de la convention.
- **pgTAP** : `ck_dossiers_modality_in_set` rejette `modality` hors `modalities` ; le backfill
  remplit `modalities` depuis le scalaire.
- **Manuel** : cocher plusieurs modalités → dossier enregistré (ensemble + primaire) →
  convention liste les modalités.

## 9. Ordre de développement (CLAUDE.md)
1. Migration (colonne + backfill + CHECK).
2. pgTAP (CHECK + backfill).
3. Helpers purs + Zod + tests Vitest.
4. UI multi-select (caveat mock).
5. Convention PDF (liste).
6. Golden path manuel.

Additif, rayon minimal : le scalaire « primaire » reste la valeur canonique pour le domaine,
les events et les PDF existants ; `modalities` étend sans rien casser.
