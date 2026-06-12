# Design — Qualiopi bloquant (moteur de calcul + gates entrée/clôture)

**Date** : 2026-06-12
**Statut** : validé (brainstorming) — à transformer en plan d'implémentation
**Scope** : moteur de readiness Qualiopi + enforcement dur aux transitions dossier

## Problème

Le suivi Qualiopi se fait via checklists papier/Excel **non bloquantes** : on peut
livrer/démarrer un dossier sans analyse des besoins préalable (indicateur 4) →
**non-conformité en cas d'audit**.

## Constat d'audit du code (important)

L'app a l'**ossature** Qualiopi mais pas le **moteur** :
- Existant : `qualiopi_indicators` (référentiel 32 indicateurs, seedé dans
  `supabase/seed.sql`), `qualiopi_proofs`, `qualiopi_dossier_checklists`
  (`blocking_missing` + `is_ready` généré), `dossiers.qualiopi_ready/_readiness`,
  un modèle domaine `dossier.entity.ts` avec un gate de **clôture**.
- **Trous** : (1) rien ne calcule la checklist (commentée « snapshot calculé par
  cron » — ce cron n'existe pas) ; (2) le gate de clôture du domaine est du **code
  mort** (aucun adaptateur `QualiopiReadinessPort`, aucune commande n'appelle
  `.close()/.schedule()/.activate()`) ; (3) les transitions réelles passent par le
  RPC `save_dossier` (`status = EXCLUDED.status`, sans contrôle) ; (4) aucun gate
  d'entrée.

## Décisions de cadrage (validées)

1. **Périmètre** : moteur complet — calcul de readiness + gates **entrée ET clôture**.
2. **Dureté** : blocage dur, **zéro exception** (pas d'override).
3. **Classification** : référentiel standard fourni (seed) + **override par OF**.
4. **Gate d'entrée** : bloque la transition **`→ active`** (démarrage réel).
   Gate de clôture : bloque **`→ closed`**.
5. **Satisfaction d'un indicateur** : preuve valide **OU** artefact métier réel
   (questionnaire complété, émargement signé, doc signé).
6. **Approche** : A — gates appliqués **en base** (trigger SQL incontournable) +
   calcul event-driven pour la fraîcheur UI. (B/DDD écarté : gros refactor et
   contournable par chemin SQL ; C/léger écarté : pas de vrai blocage dur.)

## Existant réutilisé

- `qualiopi_indicators`, `qualiopi_proofs`, `qualiopi_dossier_checklists`.
- Artefacts de satisfaction : `questionnaire_assignments` (kind `positionnement`,
  `evaluation_acquis` ; statut `completed`), `attendance_sheets` (`finalized`) /
  `attendance_signatures`, `documents` + `document_signatures`.
- Outbox `infra.domain_events` + cron `dispatch-events` + event déclaré
  `qualiopi.checklist.recomputed`.
- Idiome config « système + override OF » de `document_templates` / playbooks
  financeurs.

## Modèle de données

### Nouveaux enums
```sql
CREATE TYPE app.qualiopi_gate_stage AS ENUM ('entry', 'closing', 'none');
CREATE TYPE app.qualiopi_satisfaction_source AS ENUM (
  'proof', 'questionnaire_positionnement', 'questionnaire_evaluation',
  'attendance_signed', 'document_signed'
);
```

### `app.qualiopi_indicator_rules` (seed standard + override OF)
```
id, organization_id (NULL = système), is_system GENERATED,
indicator_id FK qualiopi_indicators,
stage app.qualiopi_gate_stage NOT NULL,
is_blocking BOOLEAN NOT NULL DEFAULT false,
satisfaction_source app.qualiopi_satisfaction_source NOT NULL DEFAULT 'proof',
is_active BOOLEAN NOT NULL DEFAULT true,
created_at, updated_at, deleted_at,
UNIQUE (organization_id, indicator_id)
```
Résolution : la ligne org (= organization_id courant) override la ligne système
(NULL) pour le même `indicator_id`.

### Extension `app.qualiopi_dossier_checklists`
```sql
ALTER TABLE app.qualiopi_dossier_checklists
  ADD COLUMN entry_blocking_missing   INT NOT NULL DEFAULT 0,
  ADD COLUMN closing_blocking_missing INT NOT NULL DEFAULT 0;
```
`blocking_missing` (total) et `is_ready` (généré `= blocking_missing = 0`)
conservés. Les gates lisent la colonne d'étape dédiée.

## Moteur de calcul (SQL, SECURITY DEFINER)

### `app.eval_qualiopi_counts(p_dossier_id UUID) RETURNS record`
Renvoie `(total, satisfied, entry_blocking_missing, closing_blocking_missing,
blocking_missing)` **et** upsert le snapshot dans `qualiopi_dossier_checklists`
(compteurs + `details` JSONB par indicateur : `{indicator_id, number, stage,
is_blocking, satisfied, source}`). Ne touche PAS `dossiers` (appelable depuis un
trigger BEFORE sur dossiers).

Pour chaque indicateur **dossier-scope actif**, résout la règle (override OF →
système) et évalue la satisfaction selon `satisfaction_source` :
- `proof` → EXISTS preuve `qualiopi_proofs` (dossier, `deleted_at IS NULL`,
  validité courante : `valid_from <= CURRENT_DATE` si non null, idem `valid_until`).
- `questionnaire_positionnement` → EXISTS `questionnaire_assignment` du dossier
  dont le template est kind `positionnement` et `status = 'completed'`.
- `questionnaire_evaluation` → idem kind `evaluation_acquis`.
- `attendance_signed` → AUCUNE `attendance_sheet` du dossier hors `finalized`
  (et ≥ 1 feuille existante).
- `document_signed` → EXISTS document du dossier avec signature présente.

Un indicateur compte dans `*_blocking_missing` de son `stage` si `is_blocking`
ET non satisfait.

### `app.recompute_qualiopi_checklist(p_dossier_id UUID) RETURNS void`
Appelle `eval_qualiopi_counts` puis `UPDATE app.dossiers SET qualiopi_ready =
(blocking_missing = 0)`. Utilisé par les handlers d'events / l'UI.

## Enforcement — trigger SQL incontournable

`BEFORE UPDATE OF status ON app.dossiers` (fonction
`app.tg_qualiopi_transition_gate`) :
- Si `NEW.status = 'active'` et `OLD.status <> 'active'` : `SELECT` les compteurs
  via `eval_qualiopi_counts(NEW.id)` ; si `entry_blocking_missing > 0` →
  `RAISE EXCEPTION 'qualiopi_entry_blocked: %', <liste numéros indicateurs>`.
- Si `NEW.status = 'closed'` et `OLD.status <> 'closed'` : si
  `closing_blocking_missing > 0` → `RAISE EXCEPTION 'qualiopi_closing_blocked: %'`.
- Met `NEW.qualiopi_ready := (blocking_missing = 0)` (pas d'UPDATE séparé sur la
  même ligne).

Recalcul **au moment de la transition** → pas de bypass sur snapshot périmé. Tout
chemin qui modifie `status` (save_dossier, update direct) est bloqué.

Le gate de clôture de `dossier.entity.ts` devient redondant : laissé tel quel
(non branché), pas de refactor (YAGNI).

## Fraîcheur UI (event-driven, secondaire)

Handlers ajoutés au dispatcher `dispatch-events` sur : `qualiopi.proof.attached`,
`questionnaire.completed`, `attendance.finalized`, `document.signed` → appellent
`recompute_qualiopi_checklist(dossier_id)`. Émettent ensuite
`qualiopi.checklist.recomputed`. C'est du confort d'affichage ; le trigger reste
l'autorité du blocage.

## UI — section Qualiopi (page dossier)

`apps/web/app/(dashboard)/dossiers/[id]/page.tsx` : section listant les
indicateurs par étape (entrée/clôture), satisfaits/manquants, bloquants en
évidence (depuis `qualiopi_dossier_checklists.details`). Boutons « Démarrer la
formation » / « Clôturer » désactivés si `entry_/closing_blocking_missing > 0`,
avec la liste des manques. Les Server Actions de transition rattrapent l'exception
SQL (`qualiopi_entry_blocked` / `qualiopi_closing_blocked`) et l'affichent.

## RLS & tests

- `qualiopi_indicator_rules` : enable RLS ; lecture (org = courant OU NULL),
  écriture (org = courant). Système (NULL) non éditable côté authenticated.
- pgTAP : résolveurs `proof` et `questionnaire_positionnement` ; gate entrée
  bloque `→ active` (RAISE) puis passe une fois l'indicateur satisfait ; gate
  clôture bloque `→ closed` ; override OF prime sur système ; RLS cross-tenant.

## Seed standard (`qualiopi_indicator_rules`, org NULL)

Matrice des indicateurs **dossier-scope** par étape/source. Exemples cadres :
- #4 analyse des besoins → `stage=entry, is_blocking=true,
  source=questionnaire_positionnement`.
- évaluation des acquis → `stage=closing, source=questionnaire_evaluation`.
- émargement/assiduité → `stage=closing, source=attendance_signed`.
- autres indicateurs dossier → `source=proof`, `stage`/`is_blocking` selon le
  référentiel.
> La matrice complète indicateur×étape×source×blocking est à finaliser à
> l'écriture du seed (revue de spec) à partir des `qualiopi_indicators` réellement
> seedés (`scope='dossier'`).

## Hors scope (V2+)

- Override avec justification tracée (on est en blocage dur sans exception).
- Configurateur UI des règles (V1 = seed + override en base).
- Résolveurs avancés (preuves multi-documents, validité d'org héritée par dossier).
- Wiring complet du modèle domaine `dossier.entity.ts`.
