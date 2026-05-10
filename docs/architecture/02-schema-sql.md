# 02 — Schéma SQL

**Source de vérité : `supabase/migrations/0001_*.sql` à `0017_*.sql`.**

## Conventions

- **UUID v7** (extension `pg_uuidv7`) — ordonnés dans le temps, indexes B-tree perfs.
- **Snake_case** partout. Tables au pluriel.
- **Timestamps** : `created_at`, `updated_at` (trigger), `deleted_at` (soft delete).
- **Audit** : `created_by`, `updated_by` UUID → `auth.users(id)`.
- **Tenant** : `organization_id NOT NULL REFERENCES organizations(id)` sur quasi toute table.
- **Enums Postgres** pour les statuts finis (transitions claires + compact).
- **JSONB** pour structures hétérogènes uniquement (réponses questionnaires, payloads d'events, snapshots).
- **Indexes** : systématique sur `(organization_id, created_at DESC)`, sur toutes les FK, sur les colonnes filtrées par RLS.

## 4 schémas Postgres

| Schéma | Rôle |
|---|---|
| `app` | métier (dossiers, learners, formations, etc.) |
| `audit` | log d'audit append-only |
| `infra` | outbox events, processed_events, dead letter, workflows |
| `reports` | vues matérialisées dashboards |

## Tables (35 au total)

### Identity (4)
`organizations`, `profiles`, `members`, `invitations` → migration `0003`.

### CRM (3)
`companies`, `contacts`, `learners` → migration `0004`.

### Catalog (3)
`formations`, `modules`, `formation_modules` → migration `0005`.

### Trainers / Funders (3)
`trainers`, `trainer_competencies`, `funders` → migration `0006`.

### Dossier (6) — l'aggregate racine
`dossiers`, `dossier_modules`, `dossier_trainers`, `dossier_funders`, `dossier_status_history`, `dossier_drafts` → migration `0007`.

### Scheduling & Attendance (4)
`sessions`, `session_participants`, `attendance_sheets`, `attendance_signatures` → migration `0008`.

### Documents (5)
`document_templates`, `document_template_versions`, `documents`, `document_signatures`, `document_access_log` → migration `0009`.

### Qualiopi (3)
`qualiopi_indicators` (32 lignes seedées), `qualiopi_proofs`, `qualiopi_dossier_checklists` → migration `0010`.

### Questionnaires (3)
`questionnaire_templates`, `questionnaire_assignments`, `questionnaire_responses` → migration `0011`.

### Complaints (2)
`complaints`, `complaint_events` → migration `0012`.

### Billing (3)
`invoices`, `invoice_lines`, `payments` → migration `0013`.

### Infrastructure (8)
`infra.domain_events`, `infra.processed_events`, `infra.event_dead_letter`, `infra.workflows`, `infra.workflow_runs`, `app.notifications`, `app.feature_flags`, `audit.audit_log` → migration `0014`.

## Triggers (livrable au sein de `0015_triggers.sql`)

- **`set_updated_at`** appliqué à toutes les tables avec `updated_at` (boucle `DO`).
- **`audit_row`** sur ~20 tables sensibles (insert/update/delete → `audit.audit_log`).
- **`guard_dossier_transitions`** : valide les transitions de statut + écrit l'historique.
- **`audit.deny_mutation`** : `audit.audit_log` est append-only.

## Vues (livrable `0017_views.sql`)

- `app.v_dossiers_overview` — vue 360° pour la UI (lecture rapide).
- `reports.mv_org_kpis` — matérialisée, refresh toutes les 15 min via cron.

## RPCs (livrable `0024_rpc_save_dossier.sql`)

- **`save_dossier(p_dossier jsonb, p_events jsonb[])`** — atomicité agrégat + outbox, `SECURITY DEFINER` avec guard `organization_id`.
- **`claim_events_for_dispatch(p_batch int)`** — `FOR UPDATE SKIP LOCKED` pour le dispatcher.
