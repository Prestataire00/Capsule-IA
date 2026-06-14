# Design — Sessions partagées multi-entreprises (multi-modalités)

**Date** : 2026-06-13
**Statut** : validé (brainstorming) — à transformer en plan d'implémentation
**Scope** : découpler la session du dossier unique pour permettre une classe partagée entre plusieurs entreprises avec volumes et fenêtres décalés.

## Problème

Une même classe réelle peut réunir des apprenants de plusieurs entreprises avec
des volumes et des dates d'entrée/sortie différents (entreprise A à 70h,
entreprise B à 30h, entrées/sorties décalées). Aujourd'hui `sessions.dossier_id`
est **NOT NULL** (1 session = 1 dossier = 1 apprenant + 1 entreprise) → pour
partager une session il faut la **dupliquer** (1 par dossier) → doublons de
sessions + **planning formateur incohérent** (le formateur apparaît N fois sur le
même créneau réel). Non gérable nativement par Digiforma.

## Constat d'audit du code

- `app.sessions(dossier_id NOT NULL, modality, starts_at, ends_at, trainer via
  session_participants, duration_hours GENERATED)`.
- `app.dossiers` : **1 apprenant** (`learner_id NOT NULL`) + `company_id` +
  `formation_id`, `start_date`/`end_date`, `total_hours`. → entreprise B à 30h ×
  N salariés = N dossiers (même entreprise/formation, 30h).
- `app.session_participants(session_id, participant_kind, learner_id|trainer_id,
  PK(session_id,kind,participant_id), is_required)`.
- `app.attendance_sheets(session_id, dossier_id NOT NULL, half_day,
  UNIQUE(session_id, half_day), status)` ; `app.attendance_signatures` est
  **déjà par apprenant** (lié à la feuille, pas au dossier). → seul verrou pour
  une feuille partagée = `attendance_sheets.dossier_id NOT NULL`.
- Couplage `session.dossier_id` lu par : PDF émargement, RPC apprenant, Zoom,
  signatures, RLS, triggers, vues. → on le **conserve** (additif) pour ne rien
  casser.
- Logique `materializeSheets` (découpe demi-journées) dans
  `apps/web/features/attendance/domain/materialize.ts` — inchangée.

## Décisions de cadrage (validées)

1. **Modèle** : 2 — session partageable par plusieurs dossiers (M2M), pas de
   nouvel agrégat « Groupe ». Dossier reste racine.
2. **Présences (entrées/sorties décalées)** : dérivées par défaut de la fenêtre
   du dossier + override manuel.
3. **`sessions.dossier_id`** : conservé NOT NULL comme **dossier primaire/origine**
   (additif, zéro casse) ; le partage fait autorité via `session_dossiers`.
4. **PDF émargement groupé par entreprise** : V2.

## Modèle de données

### `app.session_dossiers` (M2M de partage)
```sql
CREATE TABLE app.session_dossiers (
  session_id UUID NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  dossier_id UUID NOT NULL REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, dossier_id)
);
CREATE INDEX ix_session_dossiers_dossier ON app.session_dossiers(dossier_id);
```
**Backfill** : `INSERT ... SELECT id, dossier_id, organization_id FROM app.sessions`.

### Modifications
- `ALTER TABLE app.attendance_sheets ALTER COLUMN dossier_id DROP NOT NULL;`
  (feuille partagée → contexte dossier dérivé par apprenant).
- `CREATE TYPE app.participant_source AS ENUM ('derived','manual_add','manual_remove');`
  `ALTER TABLE app.session_participants ADD COLUMN source app.participant_source
  NOT NULL DEFAULT 'manual_add';` (l'existant = saisi manuellement).

## Dérivation des présences

`app.derive_session_attendees(p_session_id UUID) RETURNS SETOF UUID` (learner_ids) :
pour chaque dossier lié via `session_dossiers`, renvoie `dossier.learner_id` si la
**date de la session** (`sessions.starts_at::date`) ∈ `[dossier.start_date,
dossier.end_date]`. → A (fin tardive) reste attendu, B (30h, fin tôt) sort
automatiquement.

`app.materialize_session_participants(p_session_id UUID) RETURNS INT`
(SECURITY DEFINER) : upsert les participants apprenants `source='derived'` depuis
la dérivation ; **ne touche pas** les lignes `manual_add`/`manual_remove`. Supprime
les `derived` qui ne sont plus dérivés (sauf si re-marqués manuels).
**Présents effectifs** = (dérivés ∪ `manual_add`) − `manual_remove`.

Recalcul déclenché par événements (dossier lié ajouté/retiré, fenêtre dossier
modifiée, session re-planifiée) via l'outbox `dispatch-events`.

## Anti-doublons & planning formateur

- La cause disparaît par le **workflow** : créer **une** session puis y rattacher
  A et B (au lieu d'une session par dossier). Le planning formateur lit les
  sessions (une ligne par créneau réel) → plus de doublons.
- **Garde anti-chevauchement formateur** (heuristique douce, non bloquante) : à la
  création/édition, alerter si le formateur a déjà une session chevauchant le
  créneau. Implémentée comme requête de détection côté Server Action (warning UI).

## Émargement partagé

Feuilles matérialisées par session (`materializeSheets` inchangé), `dossier_id`
nullable. Signatures générées pour les apprenants **effectifs** (dérivés+override).
Le contexte entreprise/dossier d'un apprenant pour une feuille se dérive via
`session_dossiers` + `dossiers.learner_id`. PDF groupé par entreprise = V2.

## Suivi des volumes par dossier

Vue `app.dossier_session_hours` (ou requête) : par dossier, somme des
`duration_hours` des sessions partagées où son apprenant est effectivement présent,
comparée à `dossiers.total_hours`. Lecture seule (V1) — permet de visualiser
l'atteinte du volume (70h/30h) cohérente avec les sorties décalées.

## RLS & tests

- `session_dossiers` : enable RLS, lignes `organization_id = current_organization_id()`.
- pgTAP : dérivation avec fenêtres décalées (A vs B), override (`manual_add`/
  `manual_remove` préservés au recalcul), feuille partagée couvrant 2 dossiers,
  RLS cross-tenant, backfill cohérent.

## UI (page sessions dossier)

> ⚠️ Les pages dossier/sessions sont actuellement en **données mock**
> (cf. [[project_ia_infinity_ui_mock]]). Le branchement données réelles
> (Server Component async + `supabaseServer()`) est un préalable à toute UI réelle ;
> à intégrer dans le plan comme tâche dédiée (comme pour le chantier Qualiopi).

Édition de session : sélection multi-dossiers (entreprises partageant la classe) ;
liste des présents effectifs par session avec ajout/retrait (override) ; alerte
chevauchement formateur ; encart volumes par dossier.

## Hors scope (V2+)

- Agrégat Groupe/Cohorte nommé (Modèle 1).
- PDF émargement groupé par entreprise.
- Blocage dur anti-chevauchement (V1 = alerte).
- Refonte UI planning formateur au-delà du dédoublonnage.
- Dérivation sur dates de **module** (`dossier_modules.start_date/end_date`) plutôt
  que fenêtre dossier (V1 = fenêtre dossier).
