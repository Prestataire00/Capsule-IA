# 01 — Vision architecture

## 5 principes directeurs

1. **Modular monolith**, pas microservices. Les bounded contexts sont des dossiers, pas des services.
2. **Le Dossier est l'aggregate racine.** Tout (modules, sessions, émargements, documents, questionnaires, factures) se rattache à un `dossier_id`.
3. **Multi-tenant via `organization_id` + RLS.** Une colonne sur chaque table, des policies RLS unifiées, un claim JWT custom.
4. **Outbox pattern pour les events**, pas Kafka. `infra.domain_events` écrit dans la même TX que l'état métier.
5. **Server Actions par défaut, API routes seulement aux frontières externes** (webhooks, intégrations tierces).

## Architecture en couches

```
apps/web/
├── app/                # Next.js App Router
├── features/           # bounded contexts (DDD)
│   └── <context>/
│       ├── domain/         ← entités, VO, events, invariants (pure TS)
│       ├── application/    ← use cases, ports, queries
│       ├── infrastructure/ ← adaptateurs Supabase
│       └── ui/             ← schemas Zod, Server Actions, components
└── shared/             ← cross-cutting (supabase clients, lib, ui)

supabase/
├── migrations/         ← SQL versionné (source de vérité)
├── functions/          ← Edge Functions (Deno)
└── tests/              ← pgTAP RLS tests
```

## Bounded contexts

| Contexte | Responsabilité | Aggregate racine |
|---|---|---|
| `identity` | utilisateurs, orgs, rôles, invitations | `Organization`, `User` |
| `crm` | entreprises, contacts, apprenants | `Company`, `Learner` |
| `catalog` | formations, modules (templates) | `Formation` |
| `dossier` | instance formation pour 1 apprenant | **`Dossier` (racine métier)** |
| `scheduling` | sessions, créneaux, calendriers | `Session` |
| `attendance` | émargements, présence | `AttendanceSheet` |
| `documents` | templates, génération, signatures | `Document` |
| `qualiopi` | preuves, audit, indicateurs | `ComplianceFile` |
| `questionnaire` | positionnement, satisfaction | `Questionnaire`, `Response` |
| `complaint` | réclamations | `Complaint` |
| `billing` | factures, paiements | `Invoice` |
| `automation` | workflows, règles, déclencheurs | `Workflow`, `WorkflowRun` |
| `notification` | email, SMS futurs, push | `NotificationTemplate` |

## Stratégie event-driven (outbox)

```
[Server Action]
   ├── BEGIN TX
   ├── UPDATE state
   ├── INSERT INTO infra.domain_events
   └── COMMIT TX
                │
                ▼
   [pg_cron → Edge Fn dispatch-events]
                                          │
                                          ├── handler 1 (Qualiopi recompute)
                                          ├── handler 2 (Resend email)
                                          └── handler 3 (Zoom create meeting)
```

- Idempotence : `infra.processed_events(event_id, handler_name)` UNIQUE.
- Retry exponentiel : `attempts++`, `next_retry_at = now() + 2^attempts min`, jusqu'à 8 tentatives.
- Au-delà → `infra.event_dead_letter` + alerte ops.

## Sécurité (vue d'ensemble)

- RLS deny-by-default + `FORCE ROW LEVEL SECURITY` (livrable 05).
- Audit trail via triggers Postgres → `audit.audit_log` (append-only).
- Soft delete par `deleted_at`. Hard delete uniquement via Edge Fn anonymisation RGPD.
- Signed URLs Storage TTL court (5–15 min).
- MFA TOTP pour `owner` / `admin` / `comptable`.
