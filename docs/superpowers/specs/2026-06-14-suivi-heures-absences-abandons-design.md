# Design — Suivi heures réelles vs prévues + absences/abandons + alerte sous-volume

**Date** : 2026-06-14
**Statut** : validé (brainstorming) — à transformer en plan d'implémentation
**Scope** : read-model temps réel des heures (dispensées/suivies) par dossier, gestion des absences/abandons, alerte de risque de finir sous le volume financé.

## Problème

Pas de suivi des **heures réelles dispensées vs prévues**, ni de gestion des
absences/abandons en temps réel → **risque de finir une formation en dessous des
heures payées par le financeur** (sous-volume non détecté à temps).

## Constat d'audit du code

- **Heures prévues** : `dossiers.total_hours`, `dossier_modules.duration_hours`,
  `sessions.duration_hours` (GENERATED).
- **Heures réelles** : dérivables de l'émargement — `attendance_signatures.status`
  (enum `attendance_status` : `present`, `absent`, `absent_justified`, `late`,
  `remote`) reliées à `attendance_sheets` → `sessions`.
- **Sessions d'un dossier** : `app.session_dossiers` (M2M, feature sessions
  partagées) + `sessions.dossier_id` (primaire). `session_status` :
  `planned`, `in_progress`, `done`, `cancelled`.
- **Vue existante** `app.attendance_consolidated` (par feuille) — fondation
  possible mais agrégée par sheet, pas par dossier.
- **Absences** : déjà modélisées (`attendance_status`).
- **Abandons** : ❌ aucun concept (ni `dossier_status='abandoned'`, ni flag).

## Décisions de cadrage (validées)

1. **Deux KPI** : heures **dispensées** par l'OF (session tenue) ET heures
   **suivies** par l'apprenant (présence émargée). L'écart = absences.
2. **Abandon** : **flag manuel** sur le dossier (`abandoned_at` + motif) ; le
   calcul des heures s'arrête à cette date. (Pas de nouveau statut dossier.)
3. **Alerte de risque** : **projection** — `suivi_à_date + restant_planifié <
   total_hours` (volume financé) → `at_risk`. Anticipe avant la fin.
4. **Temps réel** : recalcul event-driven (émargement, statut session, abandon) +
   alerte via `app.notifications`.
5. **Granularité V1** : **session** (demi-journées = V2).
6. **Seuil `at_risk`** : strict `< total_hours`.
7. **Approche** : A — snapshot + recompute event-driven + alerte (cohérent avec le
   moteur Qualiopi ; permet l'alerte proactive). B (vue à la lecture) écartée : pas
   d'alerte « temps réel ».

## Modèle de données

### Additions `app.dossiers`
```sql
ALTER TABLE app.dossiers
  ADD COLUMN abandoned_at   DATE,
  ADD COLUMN abandon_reason TEXT;
```

### `app.dossier_hours_tracking` (snapshot, 1 ligne/dossier)
```
dossier_id UUID PK REFERENCES app.dossiers(id) ON DELETE CASCADE,
organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
hours_planned            NUMERIC(8,2) NOT NULL DEFAULT 0,  -- = total_hours
hours_delivered          NUMERIC(8,2) NOT NULL DEFAULT 0,  -- OF (sessions tenues)
hours_attended           NUMERIC(8,2) NOT NULL DEFAULT 0,  -- apprenant présent
hours_remaining_planned  NUMERIC(8,2) NOT NULL DEFAULT 0,
projected_final_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,
attendance_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,  -- suivi/dispensé %, 0 si dispensé=0
sessions_held            INT NOT NULL DEFAULT 0,
absences_count           INT NOT NULL DEFAULT 0,
justified_absences_count INT NOT NULL DEFAULT 0,
at_risk BOOLEAN NOT NULL DEFAULT false,
computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
```
RLS : `organization_id = app.current_organization_id()`.

## Moteur de calcul — `app.recompute_dossier_hours(p_dossier_id UUID)`

SECURITY DEFINER, `search_path = app, public`. Étapes :
1. Charge dossier (org, `total_hours`, `learner_id`, `start_date`, `end_date`,
   `abandoned_at`).
2. Sessions du dossier = `DISTINCT` via `app.session_dossiers` où
   `dossier_id = p_dossier_id` (le backfill garantit la session primaire).
3. **Tenue** = `status = 'done' OR ends_at < now()` (hors `cancelled`). Si
   `abandoned_at` non NULL : ne compter que les sessions `starts_at::date <= abandoned_at`.
4. `hours_delivered` = Σ `duration_hours` des sessions tenues.
5. `hours_attended` = Σ `duration_hours` des sessions tenues où l'apprenant
   (`dossier.learner_id`) a **au moins une signature** `status ∈ (present, late,
   remote)` (via `attendance_sheets` → `attendance_signatures`), comptée **une fois
   par session** (DISTINCT).
6. `absences_count` / `justified_absences_count` = sessions tenues où signature
   `absent` / `absent_justified`.
7. `hours_remaining_planned` = Σ `duration_hours` des sessions **non tenues**
   (`status IN ('planned','in_progress')` et non passées), dans la fenêtre dossier,
   et avant `abandoned_at` si abandon (sinon 0 si abandonné).
8. `projected_final_hours` = `hours_attended + hours_remaining_planned`
   (si `abandoned_at` : = `hours_attended`).
9. `at_risk` = `projected_final_hours < total_hours`.
10. `attendance_rate` = `hours_delivered > 0 ? round(hours_attended/hours_delivered*100,2) : 0`.
11. Upsert le snapshot (ON CONFLICT dossier_id).

Renvoie `at_risk` (pour que l'appelant émette l'alerte au franchissement).

## Temps réel + alerte (outbox)

- Handlers ajoutés au dispatcher `dispatch-events`, sur :
  `attendance.signature_recorded` (ou équivalent émis à la signature),
  `session.status_changed`, `dossier.abandoned` → appellent
  `recompute_dossier_hours`.
- Quand `at_risk` **passe** de false à true lors d'un recompute, émettre
  `dossier.hours_at_risk` → handler crée une `app.notifications`
  (`template_code='dossier_hours_at_risk'`, `related_aggregate_type='dossier'`).
- L'alerte ne se re-déclenche pas tant qu'`at_risk` reste true (comparaison à
  l'ancien snapshot avant upsert).

## Server Actions

- `markDossierAbandoned(dossierId, date, reason)` : set `abandoned_at`/`abandon_reason`,
  recompute, émet `dossier.abandoned`.
- `recomputeHoursNow(dossierId)` : recompute manuel (bouton).

## UI (page/onglet dossier dédié « Heures »)

`apps/web/app/(dashboard)/dossiers/[id]/heures/page.tsx` (Server Component async,
`supabaseServer()`, prod-safe : snapshot absent → valeurs 0/section neutre) :
- 4 jauges : **prévu / dispensé / suivi / projeté** (+ % assiduité).
- Badge **À risque** (rouge) si `at_risk`, avec l'écart projeté vs financé.
- Compteurs absences (dont justifiées).
- Action **Marquer un abandon** (date + motif) → `markDossierAbandoned`.
- Bouton **Recalculer**.
- Onglet « Heures » ajouté à `TabsNav`.

## RLS & tests (pgTAP)

- `dossier_hours_tracking` : RLS org-scopée + test cross-tenant.
- Moteur : dispensé vs suivi (1 présent, 1 absent), projection `at_risk` (cas
  sous le volume et au-dessus), arrêt du calcul à `abandoned_at`, `attendance_rate`.

## Hors scope (V2)

- Granularité demi-journée (pondération des heures par sheet).
- Abandon auto-détecté (N absences consécutives).
- Re-facturation / avoirs financeur automatiques sur sous-volume.
- Réutilisation/fusion avec `attendance_consolidated` (V1 calcule indépendamment).
