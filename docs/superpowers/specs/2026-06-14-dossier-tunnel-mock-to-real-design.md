# Migration tunnel dossier : mock → réel (liste + aperçu)

Date : 2026-06-14
Statut : design validé, prêt pour plan d'implémentation

## Problème

`https://…/dossiers/d-1/qualiopi` renvoie **404** en prod. Ce n'est ni un
problème de route ni de déploiement : la route existe
([dossiers/[id]/qualiopi/page.tsx](../../../apps/web/app/(dashboard)/dossiers/[id]/qualiopi/page.tsx)).

Cause racine — **split-brain mock ↔ Supabase réel** dans le tunnel dossier :

| Niveau | Fichier | Source | Conséquence |
|---|---|---|---|
| Liste | `dossiers/page.tsx` | `shared/mock/data` (ids `d-1`…) | liens vers ids mock |
| Aperçu | `dossiers/[id]/page.tsx` | `shared/mock/data` | carte Qualiopi linke `/dossiers/d-1/qualiopi` |
| Qualiopi, heures, sessions, financeurs | `[id]/<tab>/page.tsx` | `app.dossiers` (UUID réel) | `if (!dossier) notFound()` |

`app.dossiers.id` est un UUID ; `'d-1'` n'existe pas → `notFound()` → 404.
Le même 404 frappe **tous** les onglets déjà migrés en réel (qualiopi, heures,
sessions, financeurs) dès qu'on y accède depuis un dossier mock. En prod, aucun
dossier réel n'est atteignable depuis l'UI (liste + aperçu mock).

On supprime le split-brain en branchant **liste + aperçu** sur Supabase, et on
sème un dossier réel visible sous l'org de l'utilisateur connecté.

## Prérequis opérationnels (bloquants, hors code)

À vérifier **avant** de conclure que la migration fonctionne. Si non remplis, la
liste reste vide / l'aperçu 404 même après migration — ce n'est alors pas un bug
du code livré.

1. **Auth hook activé en prod.** Le claim JWT `organization_id` est injecté par
   `app.before_token_emit` ([0042_auth_hook.sql](../../../supabase/migrations/0042_auth_hook.sql)).
   La fonction est déployée et activée en local ([config.toml](../../../supabase/config.toml) `[auth.hook.custom_access_token]`),
   mais **en Supabase Cloud l'activation est un toggle dashboard** (Auth → Hooks
   → Custom Access Token → `app.before_token_emit`), non piloté par `config.toml`.
2. **Membership de l'utilisateur.** Le hook lit `app.members` (org par défaut).
   Sans ligne `members` active pour le compte connecté, le claim est NULL.

**Procédure de vérification (≈2 min)** : décoder le cookie `sb-…-auth-token`
(jwt.io) d'une session prod connectée → confirmer la présence de
`organization_id` ; ou vérifier le toggle dans le dashboard Auth. Si absent :
activer le hook + s'assurer d'une ligne `app.members` (onboarding).

Toutes les requêtes ci-dessous s'exécutent sous RLS via `supabaseServer()`
(session authentifiée) ; le scoping org est automatique
(`organization_id = app.current_organization_id()`).

## Composant 1 — Liste `/dossiers`

Fichier : [dossiers/page.tsx](../../../apps/web/app/(dashboard)/dossiers/page.tsx).

- Passe en **Server Component async**.
- Requête principale avec jointures intégrées PostgREST :
  ```ts
  sb.schema('app').from('dossiers')
    .select(`id, reference, status, modality, start_date, end_date,
             total_amount_cents, qualiopi_ready,
             learner:learners(first_name, last_name),
             company:companies(name),
             formation:formations(title)`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  ```
- **Colonne Qualiopi** : 2ᵉ requête `qualiopi_dossier_checklists`
  (`dossier_id, satisfied_indicators, total_indicators, entry_blocking_missing,
  closing_blocking_missing`) filtrée `.in('dossier_id', ids)`, mappée par
  `dossier_id`. Pas de checklist → afficher `—/—` discret ; `blocking =
  entry_blocking_missing + closing_blocking_missing` pour le ton (cf. logique
  mock `qualiopiBlocking`).
- **Filtres** : statut poussé dans la requête (`.in('status', statuses)` si
  `statuses.length`) ; recherche `q` filtrée en mémoire sur
  `reference + nom apprenant + titre formation` (UX identique à l'actuel).
- **Empty states** : conserver « aucun résultat pour ces filtres » ; ajouter un
  cas distinct « org sans aucun dossier » (CTA vers seed / nouveau).
- Markup, avatars, pills, en-tête : **inchangés**. Le composant `Avatar` et les
  helpers de statut restent.

Mapping mock → réel des champs de ligne :

| Mock | Réel |
|---|---|
| `learnerFullName(d.learnerId)` | `d.learner.first_name + ' ' + d.learner.last_name` |
| `companyName(d.companyId)` | `d.company?.name ?? '—'` |
| `formationTitle(d.formationId)` | `d.formation?.title` (fallback `formation_snapshot.title`) |
| `d.startDate / d.endDate` | `d.start_date / d.end_date` |
| `d.totalAmountCents` | `d.total_amount_cents` |
| `d.qualiopiSatisfied/Total/Blocking` | checklist (2ᵉ requête) |

## Composant 2 — Aperçu `/dossiers/[id]`

Fichier : [dossiers/[id]/page.tsx](../../../apps/web/app/(dashboard)/dossiers/[id]/page.tsx).

- **Server Component async**. Requête dossier core + jointures (apprenant,
  entreprise, formation, dates, montant, statut, `qualiopi_ready`) →
  `if (!dossier) notFound()`.
- **Cartes branchées réel** :
  - **Modules** : `dossier_modules` où `dossier_id` (`title_snapshot`,
    `duration_hours`, `position`) — count + 4 premiers.
  - **Sessions** : `session_dossiers` → `sessions` (même chemin que l'onglet
    Sessions, pour cohérence des compteurs) — count + 4 prochaines.
  - **Qualiopi** : `qualiopi_dossier_checklists` (satisfied/total + blockers
    issus de `details`).
  - **Financement** : `dossier_funders` + `funders(name)` ; montant =
    `total_amount_cents`.
  - **Formateurs** : `dossier_trainers` + `trainers(first_name, last_name)`.
- **Cartes Documents / Questionnaires** : état vide réel (compte réel des tables
  correspondantes ; = 0 après seed). Pas de mock résiduel.
- **Timeline d'activité** : **retirée** (le bloc `ActivityItem` statique est
  supprimé — pas de flux `infra.domain_events` exposé ; hors périmètre).
- `Card` et le markup des cartes : inchangés.

## Composant 3 — Seed ciblé sur l'org de l'utilisateur

Fichier : [api/admin/seed-demo/route.ts](../../../apps/web/app/api/admin/seed-demo/route.ts).

Le seed actuel crée un org « Démo » **isolé** → son dossier vit sous un
`organization_id` ≠ claim JWT de l'utilisateur → RLS le masque. Corrections :

- **Cibler l'org réel via `?org=<uuid>`** (query string, en plus de `secret`).
  Quand fourni : créer formation / apprenant / dossier / sessions sous **cet**
  `organization_id` au lieu de créer un org Démo. Validation : 404/400 si l'org
  n'existe pas.
- **GET d'aide** : `GET /api/admin/seed-demo?secret=…` retourne la liste des
  orgs existantes (`id, name, slug`) pour copier le bon `org` (service-role, ne
  voit pas le JWT utilisateur — d'où le besoin de lister).
- **Lien `session_dossiers`** : après insertion des sessions, insérer aussi
  `session_dossiers (session_id, dossier_id, organization_id)`. Sans ça, l'onglet
  Sessions et la carte Sessions de l'aperçu affichent 0 (ils lisent
  `session_dossiers`, pas `sessions.dossier_id`).

Note `Date.now()` : ce code tourne dans un route handler Node (pas un workflow),
`new Date()` y est autorisé — inchangé.

## Vérification

- `next build` (le `pnpm typecheck` n'est jamais vert sur ce repo — valider via
  build). Pas de `pnpm db:*` requis (aucune migration, RLS inchangée).
- **Manuel en prod** :
  1. Prérequis auth hook vérifiés (cf. section dédiée).
  2. `GET /api/admin/seed-demo?secret=…` → copier l'`org` de l'utilisateur.
  3. `POST /api/admin/seed-demo?secret=…&org=<uuid>` → dossier `DEMO-2026-001`.
  4. `/dossiers` affiche le dossier → clic → aperçu réel → clic **Qualiopi** →
     **plus de 404**.

## Hors périmètre (assumé)

- Wizard `/dossiers/nouveau` persistant (aujourd'hui prototype mock, non
  persistant — `shared/mock/data`, aucune Server Action).
- Onglets modules / documents / questionnaires / emargements encore mock.
- Timeline d'activité branchée sur un flux d'événements réel.

## Risques

- **Prérequis auth hook non rempli en prod** → liste vide / 404 persistant.
  Mitigation : section prérequis + procédure de vérif en tête de l'implémentation.
- **Cohérence compteurs sessions** : on s'aligne sur `session_dossiers` (canon
  multi-dossier) côté aperçu ET seed pour éviter toute divergence avec l'onglet.
- **Pas de collision parallèle** : vérifié le 2026-06-14 — ni les worktrees
  (`dashboard-kpis`, `espace-ressources-tracabilite`) ni la PR #5 ne migrent
  liste/aperçu (restent mock). Re-vérifier `git fetch` + `gh pr list` avant
  d'ouvrir la branche.
