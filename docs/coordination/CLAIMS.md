# Registre de coordination — instances Claude parallèles

> Ismael fait souvent tourner **2 instances Claude en parallèle** sur le même repo
> (`/Users/anissa/i-a-infinity-of`, même `main` → Railway). Ce registre évite le travail
> en double et les collisions (migrations, fichiers UI partagés).

## Protocole (résumé — détail dans CLAUDE.md § Coordination)
1. **Avant** de démarrer une feature : `git fetch` + lire ce fichier + `git log origin/main --oneline -20`.
2. **Claimer** sa zone ci-dessous (1 ligne) + commit/push, avant de coder.
3. **Juste avant push/PR** : re-`fetch`, re-lire ce fichier, comparer `git show origin/main:<fichier>` à sa version.
4. **Libérer** la ligne (statut `mergé`) une fois la PR mergée.

## Zones « chaudes » (une seule instance à la fois)
`apps/web/app/inscription/**` · pages dossier UI (`app/(dashboard)/dossiers/**`) ·
`apps/web/features/attendance/**` · `app/(dashboard)/page.tsx` (home) · `supabase/migrations/**` (numéros).

## Claims actifs

| Instance | Module / chemins | Branche | Depuis | Statut |
|----------|------------------|---------|--------|--------|
| _(exemple)_ | `apps/web/app/inscription/**` | `feature/xxx` | 2026-06-14 | libéré |
| Opus (de-mock) | financeurs (de-mock) | feature/financeurs-reels | 2026-06-14 | mergé (PR #21) |
| Opus (de-mock) | de-mock dashboards (apprenants/membres/organisation/questionnaires) | feature/demock-dashboards | 2026-06-15 | mergé (PR #24) |
| Opus (catalog+dossier) | `dispatch-events/route.ts` + migrations 0073/0074 (garde-fous dossier) ; déjà mergé : prix module, contrat formateur, snapshot prix, catalogue formations, /inscription (org-scopé) | (push direct main) | 2026-06-14 | mergé |
| Opus (catalog+dossier) | `shared/ui/logo.tsx` → wordmark « Capsule IA / par IA infinity » (PR #22 n'avait changé que l'alt, image PNG dit encore IA INFINITY) | (push direct main) | 2026-06-15 | mergé |

> Convention numéros de migration : avant d'écrire `supabase/migrations/NNNN_*.sql`,
> prendre `(dernier numéro sur origin/main) + 1` au moment du push, pas du brainstorm.
