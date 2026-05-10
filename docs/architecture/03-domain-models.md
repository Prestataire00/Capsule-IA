# 03 — Domain models TS

**Source de vérité : `apps/web/features/dossier/domain/`.**

## Principes

- **Couche pure**. Zéro import depuis `next`, `@supabase/*`, `react`, `zod`.
- **Branded types** pour les IDs (`DossierId`, `LearnerId`...) : un `DossierId` ne peut pas être assigné à une `LearnerId`.
- **Result-type** pour les erreurs métier attendues (`Result<T, E>`). Throw réservé aux bugs.
- **Constructeur privé + `create()` statique** retournant `Result`. **`hydrate()`** pour les loads depuis le repo.
- **Events recordés en mémoire**, vidés par `pullEvents()` que le repo écrit dans la même TX que l'état.

## Aggregate `Dossier` — fichiers

```
features/dossier/domain/
├── ids.ts                                  ← branded UUIDs
├── value-objects/
│   ├── date-range.ts
│   ├── money.ts                            ← cents BIGINT, jamais float
│   ├── hours.ts                            ← résolution 0.25h
│   ├── share-percent.ts                    ← 0-100, 2 décimales
│   ├── dossier-reference.ts                ← regex DOS-YYYY-NNNN
│   ├── dossier-status.ts                   ← 8 statuts + transitions
│   ├── training-modality.ts                ← 4 modalités
│   └── funder-allocation.ts
├── entities/
│   ├── dossier-module.ts
│   ├── dossier-trainer.ts
│   └── dossier-funder.ts
├── dossier.errors.ts                       ← typed union
├── dossier.events.ts                       ← TS events (miroir Zod registry)
└── dossier.entity.ts                       ← AGGREGATE RACINE
```

## Invariants encodés dans l'agrégat

| Invariant | Méthode | Erreur |
|---|---|---|
| Période start ≤ end | `DateRange.create` | `invalid_date_range` |
| Modules immuables sur dossier `closed`/`archived`/`cancelled` | `addModule` / `removeModule` | `dossier_immutable` |
| Pas de modules dupliqués | `addModule` | `duplicate_module` |
| Au moins 1 formateur pour passer en `scheduled` | `schedule` | `no_trainer_assigned` |
| Au moins 1 module pour passer en `scheduled` | `schedule` | `no_modules` |
| Somme des `share_percent` ≤ 100 | `addFunder` | `funders_share_exceeds_100` |
| Transition de statut autorisée | `guardTransition` | `invalid_transition` |
| Réouverture (closed → active) admin uniquement | `reopen(canReopen)` | `reopen_forbidden` |
| Clôture bloquée si Qualiopi/docs/émargements/questionnaires manquants | `close(checklist)` | `closing_blocked` |

## Domain events émis par `Dossier`

15 events au total — voir `dossier.events.ts` et le miroir Zod dans `apps/web/features/_events/dossier.events.ts` :

```
dossier.created
dossier.module-added
dossier.module-removed
dossier.trainer-assigned
dossier.trainer-unassigned
dossier.funder-added
dossier.funder-removed
dossier.submitted
dossier.scheduled
dossier.activated
dossier.completed
dossier.closed
dossier.reopened
dossier.cancelled
dossier.archived
```

## Pattern de duplication pour les autres contextes

Tu reproduis la même structure pour CRM, Catalog, Scheduling, etc. Voir [`docs/prompts/`](../prompts/) pour les bootstraps.
