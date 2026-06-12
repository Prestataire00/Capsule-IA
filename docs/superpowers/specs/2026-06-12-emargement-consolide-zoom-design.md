# Émargement consolidé + activation de l'auto-sync Zoom — Design

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Date : 2026-06-12 · Contexte borné : `attendance` (+ lecture `dossier`, `crm`).

## 1. Problème & impact

Aujourd'hui, le justificatif de présence Zoom (formations 100 % distanciel) dépend d'un
**export CSV manuel par session**, uploadé à la main par le formateur via le panel
`zoom-import-panel`. Ces exports sont **fréquemment oubliés** par le formateur ou
l'apprenant, créant des trous de preuve. L'OF croit ces trous **irrattrapables a
posteriori**.

**Impact métier** : un financeur (OPCO, CPF, entreprise cliente) peut **refuser de payer
les heures non justifiées**. Le risque est financier et récurrent, aggravé par le modèle
multi-entreprises (modalités variables par client, sous-traitance des formateurs).

### Constat technique décisif

Le code d'**auto-sync Zoom par API existe déjà** (`apps/web/app/api/cron/zoom-sync/route.ts`
→ `fetchPastMeetingParticipants` sur `GET /v2/past_meetings/{id}/participants`). Cette API
récupère les présences **rétroactivement** tant qu'on est dans la fenêtre de rétention Zoom
(~30 jours). **Mais ce route n'est branché à aucun scheduler** : les seuls crons actifs
(`pg_cron`) concernent les tokens d'émargement (0030) et la purge IP (0040). La seule
capture réellement active est donc l'upload CSV manuel.

**Conclusion : le correctif de fond existe déjà dans le code, il est simplement désactivé.**

## 2. Objectif

Deux livrables complémentaires :

1. **Read model consolidé** — une vue d'émargement réelle (plus de mock), agrégeable
   par session / entreprise cliente / formateur, qui **détecte et quantifie** le risque de
   preuve manquante (« heures à risque de non-paiement »).
2. **Activation du backfill Zoom** — durcir puis planifier le job `zoom-sync` existant pour
   **supprimer la cause** des oublis (capture automatique dans la fenêtre de rétention).

Le 1 est le filet de sécurité ; le 2 attaque la cause. Ensemble ils mitigent le risque de
non-paiement.

### Hors périmètre (YAGNI)

- Aucune refonte du modèle d'émargement (session + demi-journée conservé).
- Aucune modification du flux de signature apprenant/formateur existant.
- Aucune alerte proactive par email (c'était le scope « C » écarté ; activable plus tard).
- Pas de matérialisation de la vue (volume d'un OF → vue calculée à la volée suffit).

## 3. Décisions prises (brainstorming)

| Décision | Choix retenu |
|---|---|
| Agrégation read model | **Vue SQL `SECURITY INVOKER`** + query TS fine (Option A) |
| Périmètre | **Dashboard + activation du cron** (Scope B) |
| Lentille par défaut | **Par session** (⇄ par entreprise, ⇄ par formateur) |
| Emplacement | **Remplace** la page mock `(dashboard)/emargements` ; drill-down = pages par-dossier existantes |
| Mécanisme de schedule | **Scheduler externe** (même outil que `transactional-emails`), pas de pg_cron+pg_net |
| Précédence auto-sync | **Ne jamais écraser une signature humaine** ; remplir uniquement les présences manquantes ; ne jamais toucher une feuille `finalized` |

## 4. Architecture & flux

```
app.attendance_sheets ─┐
app.attendance_signatures ─┤ (evidence_source → tier de preuve)
app.dossiers (company_id, trainer) ─┤
app.companies ─┤  VUE app.attendance_consolidated  (SECURITY INVOKER, RLS héritée)
app.trainers  ─┤       un row par feuille, porte company_id / trainer_id + counts
app.sessions  ─┤
app.zoom_sync_logs ─┘
                        │
                        ▼
   query TS  features/attendance/queries/consolidated-attendance.query.ts
   (filtres période / entreprise ; group by lentille ; heures à risque)
                        │
                        ▼
   page  (dashboard)/emargements/page.tsx  (Server Component — remplace le mock)
```

Aucun écrit, **aucun nouvel agrégat domain** : c'est un read model pur. Le domain layer
reste intact (red line #3). Le grain de la vue est la feuille ; le regroupement par
entreprise/formateur se fait dans la query TS.

### Tier de preuve (dérivé de `attendance_signatures.evidence_source`)

| `evidence_source` | Tier |
|---|---|
| `zoom_api`, `zoom_csv` | **Zoom** (preuve de connexion distancielle) |
| `manual`, `qr`, `trainer_override` | **Manuelle** |
| (aucune signature) | **Manquante** |

## 5. Composant — Vue `app.attendance_consolidated`

**Migration** `0043_attendance_consolidated_view.sql`. Vue `SECURITY INVOKER` (les policies
RLS des tables de base s'appliquent → isolation org gratuite). `GRANT SELECT` à
`authenticated`. Un row par `attendance_sheet`.

Colonnes (toutes dérivables des tables existantes) :

- `organization_id`, `dossier_id`, `session_id`, `attendance_sheet_id`
- `company_id`, `company_name` (via `dossiers.company_id → companies`)
- `trainer_id`, `trainer_name` (via dossier/session → `trainers`)
- `session_starts_at`, `session_ends_at`, `modality`
- `status` (`open` | `partial` | `completed` | `finalized`)
- `expected_count` — participants attendus (apprenants du dossier rattachés à la feuille)
- `signed_count`, `missing_count`
- `zoom_count`, `manual_count` (counts par tier de preuve)
- `zoom_last_sync_status` — dernier `zoom_sync_logs.status` de la session (`success` |
  `partial` | `error` | `null`)

Interface : un consommateur lit la vue sans connaître les jointures sous-jacentes.
Dépendances : tables `attendance_*`, `dossiers`, `companies`, `trainers`, `sessions`,
`zoom_sync_logs`.

## 6. Composant — Query TS `consolidated-attendance.query.ts`

`features/attendance/queries/consolidated-attendance.query.ts`. Lecture pure → pas de
`Result` requis. Types issus de `shared/types/database.ts` (`pnpm db:types` après migration).

Entrées : `{ lens: 'session' | 'company' | 'trainer', period?: {from, to}, companyId?: string }`.
Sortie : lignes agrégées selon la lentille + un résumé org-wide.

Calculs :

- **Taux de signatures** = `signed_count / expected_count`.
- **Couverture preuve Zoom** = `zoom_count / signed_count` (distanciel).
- **Heures à risque** = somme des heures des feuilles **non `finalized`, sans preuve
  suffisante**, encore dans la fenêtre de rétention Zoom (récupérables) vs hors fenêtre
  (perdues) — deux sous-totaux distincts.

La lentille `session` retourne les lignes brutes de la vue (grain feuille) ; `company` /
`trainer` font un `group by` sur la dimension correspondante.

## 7. Composant — Page `(dashboard)/emargements/page.tsx`

Remplace l'implémentation mock actuelle. Server Component, archétype `command`, **charte UI
v3** (`.cursor/rules/70-ui-charter.mdc` : orange-500 brand, accents fonctionnels, tailles
imposées, 1 primaire max, dark mode obligatoire).

- **StatCards org-wide** : feuilles incomplètes · taux de signatures global · **couverture
  preuve Zoom** · **syncs Zoom en erreur**. Carte « heures à risque » mise en avant (accent
  amber/red) car c'est la métrique métier.
- **Toggle de lentille** : `Par session` (défaut) ⇄ `Par entreprise` ⇄ `Par formateur`.
- **Table groupée** : par ligne/groupe → ProgressBar signatures, badges tier de preuve
  (Zoom / Manuelle / Manquante), alerte si `zoom_last_sync_status = error`.
- **Drill-down** : ligne → page par-dossier **existante** `(dashboard)/dossiers/[id]/emargements`
  (zéro duplication).
- **Filtres** : période + entreprise (query params, gérés côté query TS).

## 8. Composant — Activation du backfill Zoom

Durcissement de `apps/web/app/api/cron/zoom-sync/route.ts` + planification externe.

### 8.1 Fenêtre de rétention (au lieu de « les N dernières »)

Actuel : `ends_at < now − 30min` + `limit(SESSION_BATCH_LIMIT=20)`, **sans borne basse** →
ne couvre que les sessions les plus récentes, et plafonne à 20.

Cible : sélectionner les sessions `distanciel` (avec `zoom_meeting_id`) terminées dans
`[now − RÉTENTION_J, now − 30min]` **dont la feuille n'est pas complète et non finalisée**.
Introduire une constante `ZOOM_RETENTION_DAYS` (défaut 25, marge sous les ~30 j Zoom) et
prioriser les sessions sans preuve. Batching conservé mais sur l'ensemble de la fenêtre
(pagination si > limite), pour ne pas laisser tomber des sessions récupérables.

### 8.2 Précédence — ne jamais écraser l'humain

Aujourd'hui `record_signature_v2` fait un `UPSERT` qui écrase `evidence_source` et force
`status='present'` au conflit. Pour l'auto-sync :

- **Présence déjà signée `manual`/`qr`/`trainer_override`** → **ne pas toucher** (preuve Zoom
  = complément, jamais substitut). Implémentation : soit le route saute ces participants
  (lecture préalable des signatures existantes), soit une variante RPC `record_signature_zoom`
  avec `ON CONFLICT … DO NOTHING` sur les signatures d'origine humaine. **À trancher au
  plan** ; préférence : garde côté route (lecture des `participant_id` déjà signés humain,
  filtrage avant `record_signature_v2`).
- **Feuille `finalized`** → déjà bloquée par le trigger d'immutabilité 0033
  (`tg_attendance_signature_immutable`). Le route doit **catcher l'erreur et compter
  `skipped`**, pas `error`.
- **Idempotence** : un re-run ne doit produire aucun effet de bord (re-remplir une présence
  Zoom déjà présente avec les mêmes données est neutre).

### 8.3 Planification (étape ops, hors repo)

Enregistrer un hit nocturne `POST /api/cron/zoom-sync` avec `Authorization: Bearer
$CRON_SECRET` dans **le même scheduler externe** que `transactional-emails` (cron-job.org /
Railway). Livrable repo = **documentation d'activation** (URL, méthode, fréquence
recommandée : 1×/nuit) ; l'enregistrement effectif est une action d'Ismael.

## 9. Sécurité (red lines)

- Vue `SECURITY INVOKER` → RLS des tables de base appliquée, **jamais** de `service_role`
  côté client (red line #1). Le route cron utilise `service_role` mais reste derrière la
  garde `CRON_SECRET` (pattern existant, conforme).
- Toute nouvelle vue → **test pgTAP cross-tenant** : org A ne voit jamais les feuilles d'org
  B via `attendance_consolidated` (red line #2).

## 10. Tests

- **pgTAP** : (a) isolation cross-tenant de la vue ; (b) précédence — une signature humaine
  n'est pas écrasée par l'auto-sync ; (c) une feuille finalisée rejette l'écriture (régression
  du trigger 0033).
- **Unit (Vitest)** : mapping `evidence_source → tier` ; agrégation TS par lentille ; calcul
  « heures à risque » (dans/hors fenêtre de rétention) ; sélection de la fenêtre de rétention
  du route.
- **Manuel** : exécuter le route avec un jeu de sessions et vérifier les compteurs
  `success/partial/error/skipped`.

## 11. Ordre de développement (CLAUDE.md)

1. Migration `0043` (vue + grant).
2. pgTAP (isolation + précédence + finalized).
3. `pnpm db:types` puis query TS + tests unit.
4. Page + composants (charte v3).
5. Durcissement route `zoom-sync` (fenêtre de rétention + précédence + skipped) + tests.
6. Documentation d'activation du schedule externe.

Read pur → pas d'étape domain/application/infra. Golden path vérifié : une session
distancielle oubliée apparaît « à risque » dans le dashboard, puis le backfill nocturne la
fait passer en preuve « Zoom » sans toucher aux signatures manuelles ni aux feuilles
finalisées.
