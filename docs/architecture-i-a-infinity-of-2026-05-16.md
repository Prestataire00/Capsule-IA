# System Architecture — Capsule IA

> ⚠️ **AVERTISSEMENT (2026-05-16) — DOCUMENT À REPRENDRE**
>
> Cette archi a été rédigée comme une consolidation des `docs/architecture/01-09-*.md` SANS audit du code réel. Le repo a déjà **41 migrations appliquées** et la plupart des composants décrits ici sont déjà partiellement ou totalement implémentés.
>
> **Notamment, l'Auth Hook (ADR-0003) est en réalité configuré dans le dashboard Supabase Cloud, pas en migration.** L'ADR reste valide comme cible (formaliser en migration pour reproductibilité dev local) mais ce n'est pas un greenfield à construire.
>
> Lire `docs/bmad-audit-i-a-infinity-of-2026-05-16.md` pour l'état réel (à venir).

**Date :** 2026-05-16
**Architect :** Ismael Lepennec
**Version :** 1.0 (à reprendre)
**Project Type :** web-app
**Project Level :** 4 (Enterprise)
**Status :** Draft — vision cible (pas reflet du code actuel)

---

## Document Overview

Ce document définit l'architecture système d'**Capsule IA**. Il consolide la matière technique existante (`docs/architecture/01-09-*.md`, ADRs, `.cursor/rules/`) au format BMAD et apporte la **traçabilité FR → composants** que le PRD réclame.

> **Lecture importante :** ce doc n'est pas la source de vérité technique. La source de vérité est : (a) le **code** (`apps/web/features/`, `supabase/migrations/`), (b) les **9 docs techniques** détaillés dans `docs/architecture/01-09-*.md`, et (c) les **ADRs**. Si un doc BMAD diverge du code, le code gagne.

**Documents liés :**
- PRD : [`docs/prd-i-a-infinity-of-2026-05-16.md`](./prd-i-a-infinity-of-2026-05-16.md)
- Docs techniques détaillés : [`docs/architecture/01-09-*.md`](./architecture/)
- ADRs : [`docs/architecture/adr/`](./architecture/adr/)
- Conventions code (Cursor rules) : [`.cursor/rules/`](../.cursor/rules/)
- CLAUDE.md (contexte agents IA) : [`CLAUDE.md`](../CLAUDE.md)

---

## Executive Summary

**Architecture Capsule IA en 6 lignes :**

1. **Modular monolith** Next.js 14 + Supabase, *pas microservices* (cf. [ADR 0001](./architecture/adr/0001-modular-monolith.md)).
2. **DDD light** : 13 bounded contexts en dossiers `features/<context>/{domain,application,infrastructure,ui}`. Couche `domain` pure (zéro import framework).
3. **Multi-tenant via `organization_id` + RLS strict** sur 100% des tables métier. Aucun bypass client.
4. **Event-driven outbox** dans Postgres (`infra.domain_events`), pas de broker externe (cf. [ADR 0002](./architecture/adr/0002-outbox-pattern.md)). 57 events typés Zod, dispatcher Edge Function.
5. **Server Components + Server Actions** par défaut. **API routes** uniquement aux frontières (webhooks, downloads). `service_role` confiné aux **Edge Functions** Deno.
6. **Aggregate racine = Dossier** — toute opération métier traverse cet objet. Invariants encodés en TS pur, persistés via RPC `save_dossier` atomique.

---

## Architectural Drivers

NFRs et contraintes qui pèsent le plus sur les choix d'archi (par ordre d'impact) :

| # | Driver | Source | Impact archi |
|---|---|---|---|
| 1 | **Multi-tenant strict** (NFR-001) | Métier SaaS B2B, RGPD | RLS forcé partout, helpers SQL, JWT custom claims, tests pgTAP cross-tenant obligatoires |
| 2 | **Conformité Qualiopi — preuves immuables** (NFR-002) | Audit auditeur | Hash SHA-256 sur preuves, `audit.audit_log` append-only via triggers, soft delete par défaut |
| 3 | **RGPD droit à l'oubli** (NFR-003) | Légal | Edge Fn anonymisation dédiée, séparation données identifiantes vs preuves Qualiopi |
| 4 | **Idempotence events & tokens** (NFR-008) | Fiabilité (mobile/réseau) | Table `processed_events` UNIQUE, retry exponentiel ×8, dead letter |
| 5 | **Génération doc p95 < 5s** (NFR-005) | UX synchrone | Edge Fn dédiée, fallback async si timeout 8s |
| 6 | **Mobile-first signatures** (NFR-006) | Apprenants smartphone | PWA formateur, canvas optimisé tactile, route group `(apprenant)/` no-auth tokenisée |
| 7 | **Server Actions p95 < 300 ms** (NFR-004) | Sensation fluidité admin | RPC Postgres (no N+1), TanStack Query, `unstable_cache` avec tags |
| 8 | **Coûts < 200 €/mois V1** (NFR-012) | Bootstrap pilote | Supabase Pro + Railway + Resend uniquement, pas de provider à coût exponentiel |
| 9 | **SLO 99.5% jours ouvrés** (NFR-007) | B2B usage diurne | Multi-instance Railway, health endpoint, Supabase managed HA |
| 10 | **Reproductibilité dev local** (NFR-011) | Onboarding + tests | Supabase CLI local complet, seed scripts, pgTAP en CI |

Les autres NFRs (accessibilité, i18n) sont importants mais influencent peu les choix structurants.

---

## System Overview

### High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                  │
│ Browser (admin/gestionnaire) │ PWA (formateur) │ Public (apprenant)│
└────────────────┬─────────────────────┬─────────────────┬───────────┘
                 │                     │                 │
                 ▼ HTTPS               ▼                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Next.js 14 App Router  (Railway)                │
│                                                                    │
│  Route groups:                                                     │
│    (public) (auth) (dashboard) (formateur) (apprenant) /api        │
│                                                                    │
│  Server Components ───► queries.ts ──► Supabase JS (RLS-bound)     │
│  Server Actions   ────► actions.ts ──► use cases ──► repos         │
│  API routes (webhooks Stripe/Zoom, health, download)               │
└────────────┬───────────────────────────────┬───────────────────────┘
             │                               │
             ▼ Postgres protocol             ▼ HTTPS
┌────────────────────────────────────────────────────────────────────┐
│                          SUPABASE                                  │
│                                                                    │
│  ┌───────────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │  Postgres         │  │  Auth        │  │  Storage         │     │
│  │  • app.* (métier) │  │  • JWT       │  │  • templates/    │     │
│  │  • audit.*        │  │  • Auth Hook │  │  • documents/    │     │
│  │  • infra.* outbox │  │    (claims)  │  │  • signatures/   │     │
│  │  • reports.* MV   │  │  • TOTP MFA  │  │  signed URLs     │     │
│  └─────────┬─────────┘  └──────────────┘  └──────────────────┘     │
│            │                                                       │
│            ▼ pg_cron                                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │           Edge Functions (Deno, service_role)                 │ │
│  │  dispatch-events │ generate-document │ sign-document          │ │
│  │  compute-qualiopi-readiness │ detect-missing-attendance       │ │
│  │  expire-questionnaires │ nightly-cleanup                      │ │
│  └─────────┬─────────────────────────────────────────────────────┘ │
└────────────┼───────────────────────────────────────────────────────┘
             │
             ▼ HTTPS
┌────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL SERVICES                            │
│  Resend (email) │ Zoom V1.5 (meetings) │ Sentry (errors)           │
│                                                                    │
│  HORS V1 : Stripe                                                  │
└────────────────────────────────────────────────────────────────────┘
```

### Architectural Pattern

**Pattern :** **Modular Monolith Event-Driven** (DDD light, multi-tenant RLS, outbox)

**Rationale :** détaillé dans [ADR 0001](./architecture/adr/0001-modular-monolith.md) et [ADR 0002](./architecture/adr/0002-outbox-pattern.md). En résumé : équipe 1-3 devs, scope V1 < 1000 OF, refactoring inter-context fréquent attendu → coût microservices disproportionné. L'outbox Postgres remplace le broker (Kafka/RabbitMQ) sans rien sacrifier à notre échelle.

### Architecture en couches (par feature)

```
apps/web/features/<context>/
├── domain/         ← entités, VO, events, invariants — PURE TS
│                     (zéro import next/supabase/react/zod)
├── application/    ← use cases, ports (interfaces), commands, queries
├── infrastructure/ ← adaptateurs Supabase (repos, mappers)
└── ui/             ← schemas Zod, Server Actions, queries SC, components
```

Voir [`docs/architecture/06-frontend.md`](./architecture/06-frontend.md) pour le détail Next.js et [`docs/architecture/03-domain-models.md`](./architecture/03-domain-models.md) pour le pattern d'agrégat de référence (`Dossier`).

---

## Technology Stack

> Stack figée, non-négociable. Toute déviation requiert un ADR.

### Frontend

| Élément | Choix | Pourquoi |
|---|---|---|
| Framework | **Next.js 14 App Router** | Server Components + Server Actions = couplage minimal client/server, type-safety bout-en-bout |
| Langage | **TypeScript strict** (`noUncheckedIndexedAccess`) | Catch des bugs à la compile, refactoring sûr |
| UI lib | **TailwindCSS + shadcn/ui** | Composants headless customisables, vélocité MVP |
| Forms | **React Hook Form + Zod resolver** | Validation client = validation server (schemas partagés) |
| Data fetching | **TanStack Query** (vues realtime/dashboards) | Cache client réactif, sync optimiste |
| State global | **Zustand** si besoin (rarement) | Léger, pas de boilerplate, sortie facile |
| i18n | **Custom helper** `t('namespace.key')` + `shared/i18n/fr.json` | V1 FR-only, archi prête EN sans surcouche prématurée |

**Trade-offs assumés :** App Router est plus jeune que Pages Router → bugs/edge cases plus fréquents mais bénéfice Server Actions énorme. Pas de Redux Toolkit (trop lourd pour notre échelle).

### Backend

| Élément | Choix | Pourquoi |
|---|---|---|
| Runtime serveur | **Next.js Server Components / Server Actions** | Pas de duplication client/server, type-safety via inférence |
| Wrappers actions | **next-safe-action** | Injection automatique `ctx.supabase`, `ctx.organizationId`, `ctx.role`, `ctx.actorIp` |
| RPC SQL atomiques | **Postgres functions** (`SECURITY DEFINER`) | Atomicité agrégat + outbox impossible côté JS sans 2PC |
| Async / side effects | **Edge Functions Deno** | Isolation `service_role`, scale-to-zero, secrets séparés |
| Cron | **pg_cron** (extension Supabase) | Pas de scheduler externe, observable en SQL |

### Database

| Élément | Choix | Pourquoi |
|---|---|---|
| SGBD | **Postgres** (via Supabase managed) | RLS natif, JSON solide, pg_cron, écosystème extensions, fiabilité éprouvée |
| Schémas | **4 schémas** (`app`, `audit`, `infra`, `reports`) | Séparation préoccupations, permissions granulaires |
| ID strategy | **UUID v7** (extension `pg_uuidv7`) | Ordonnés temporellement → indexes B-tree performants, pas de hot spot |
| Migrations | **Supabase CLI** (`supabase/migrations/*.sql`) | Versionné en git, replay déterministe local + prod |
| Tests SQL | **pgTAP** (`supabase/tests/`) | Tests RLS exhaustifs en SQL natif, CI fail-fast |

**Trade-offs :** pas de NoSQL (Mongo, DynamoDB) — modèle relationnel rigoureux requis pour Qualiopi et facturation. Pas d'event sourcing complet (cf. ADR 0001) — outbox suffit.

### Infrastructure

| Élément | Choix | Pourquoi |
|---|---|---|
| Hosting Next.js | **Railway** | DX excellente, déploiement git push, scale horizontal sans config, < 20$/mois V1 |
| Backend managé | **Supabase Pro** (~25$/mois V1) | Postgres + Auth + Storage + Edge Fn dans une seule console, support pro |
| Domaine + DNS | **Cloudflare** | DNS gratuit, TLS auto, mitigation DDoS basique |
| IaC | **Aucun** V1 (nixpacks.toml + railway.json + supabase migrations) | Pas de Terraform avant 5+ environnements |

### Third-Party Services

| Service | Usage | Coût V1 | Critique ? |
|---|---|---|---|
| **Resend** | Email transactionnel | ~20$/mois (100k emails) | Oui (signatures, convocations) |
| **Zoom API V1.5** | Création meetings distanciel | Free tier OK V1 | Non (fallback : lien manuel) |
| **Sentry** | Error monitoring | Free tier OK | Oui (visibilité bugs prod) |
| **Gotenberg** (self-host Railway) | DOCX→PDF pour preuves Qualiopi terminales (attestation, émargement final, facture validée) | ~+5$/mois Railway | Oui (preuves Qualiopi terminales uniquement, DOCX par défaut sinon) |
| **API SIRET INSEE** | Validation SIRET création OF | Free | Non (fallback : saisie manuelle) |
| **Stripe** | — | — | **HORS V1** |

### Development & Deployment

| Élément | Choix |
|---|---|
| Version control | **Git** + **GitHub** (`Prestataire00/i-a-infinity-of`) |
| Package manager | **pnpm 9** (workspace) |
| CI | **GitHub Actions** (lint, typecheck, vitest, pgTAP, playwright) |
| Build | `pnpm --filter web build` |
| Tests unit/integ | **Vitest** |
| Tests E2E | **Playwright** |
| Tests RLS | **pgTAP** (`pnpm db:test`) |
| Formatter | **Prettier** |
| Linter | **ESLint** + règles custom (interdire `any`, `as`, etc.) |

---

## System Components

13 composants logiques (= bounded contexts). Détails dans [`docs/architecture/03-domain-models.md`](./architecture/03-domain-models.md) (pattern de référence : agrégat `Dossier`).

### C-01 : Identity & Auth

**Responsabilité :** organisations, utilisateurs, rôles, invitations, MFA TOTP.
**Tables :** `organizations`, `profiles`, `members`, `invitations` (4 tables).
**Interfaces :** Server Actions `signupOrgAction`, `inviteMemberAction`, `enableMfaAction`. Auth Hook Supabase pour custom JWT claims.
**Dépendances :** Supabase Auth, Resend (invitations).
**FRs adressés :** FR-001, FR-002, FR-003, FR-004, FR-005.

### C-02 : CRM

**Responsabilité :** entreprises, contacts, apprenants.
**Tables :** `companies`, `contacts`, `learners` (3).
**Interfaces :** Server Actions CRUD + import CSV.
**FRs adressés :** FR-006, FR-007, FR-008, FR-009.

### C-03 : Catalog

**Responsabilité :** formations templates, modules, formateurs.
**Tables :** `formations`, `modules`, `formation_modules`, `trainers`, `trainer_competencies`, `funders` (6).
**Interfaces :** Server Actions CRUD, versioning des formations.
**FRs adressés :** FR-010, FR-011, FR-012.

### C-04 : Dossier (CORE)

**Responsabilité :** **agrégat racine** — wizard 3-steps, états, invariants, ajout modules/formateurs/financeurs, cycle de vie complet (`draft → … → closed`).
**Tables :** `dossiers`, `dossier_modules`, `dossier_trainers`, `dossier_funders`, `dossier_status_history`, `dossier_drafts` (6).
**Interfaces :**
- Server Actions : `createDossierAction`, `addModuleAction`, `scheduleDossierAction`, `activateDossierAction`, `closeDossierAction`, `reopenDossierAction`, `cancelDossierAction`.
- RPC SQL : **`save_dossier(p_dossier jsonb, p_events jsonb[])`** — atomicité agrégat + outbox, `SECURITY DEFINER`.
**Domaine :** `apps/web/features/dossier/domain/` (cf. [03-domain-models.md](./architecture/03-domain-models.md)) — 9 invariants encodés, 15 events émis.
**FRs adressés :** FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020.

### C-05 : Scheduling

**Responsabilité :** sessions générées depuis dossier, calendrier formateur, intégration Zoom V1.5.
**Tables :** `sessions`, `session_participants` (2).
**Interfaces :** Server Actions `rescheduleSessionAction`, queries calendrier ; Edge Fn `create-zoom-meeting`.
**FRs adressés :** FR-021, FR-022, FR-023, FR-024.

### C-06 : Attendance

**Responsabilité :** ouverture feuille émargement, tokens par participant, signatures mobile, vue realtime formateur, génération PDF preuve.
**Tables :** `attendance_sheets`, `attendance_signatures` (2).
**Interfaces :** Server Action `openAttendanceSheetAction`, Edge Fn `sign-document` (scope `sign-attendance`), Edge Fn `generate-attendance-document`. Supabase Realtime sur `attendance_signatures`.
**FRs adressés :** FR-025, FR-026, FR-027, FR-028.

### C-07 : Documents & e-Signature

**Responsabilité :** templates DOCX, génération, demande signature, capture signature canvas, hash SHA-256, attachement preuve Qualiopi.
**Tables :** `document_templates`, `document_template_versions`, `documents`, `document_signatures`, `document_access_log` (5).
**Interfaces :** Server Actions `requestDocumentGenerationAction`, `requestSignatureAction`. Edge Fn **`generate-document`** (docxtemplater + PizZip + hash, **+ appel HTTP gotenberg pour PDF si preuve Qualiopi terminale**) et **`sign-document`** (HMAC token validation, hash document, upload PNG signature).
**Dépendances :** Storage (templates + générés + signatures PNG), Resend (lien email).
**FRs adressés :** FR-029, FR-030, FR-031, FR-032, FR-033.

### C-08 : Qualiopi

**Responsabilité :** 32 indicateurs, checklist par dossier, closing checklist bloquante, dashboard global, export audit annuel.
**Tables :** `qualiopi_indicators` (seed 32 lignes), `qualiopi_proofs`, `qualiopi_dossier_checklists` (3).
**Interfaces :** port `QualiopiReadinessPort` (domain), Edge Fn **`compute-qualiopi-readiness`** (pg_cron nightly), Edge Fn **`qualiopi-audit-export`** (job async).
**FRs adressés :** FR-034, FR-035, FR-036, FR-037, FR-038.

### C-09 : Questionnaires

**Responsabilité :** templates, assignation automatique par events (positionnement, satisfaction chaud/froid), réponse apprenant tokenisée, relances cron, expiration.
**Tables :** `questionnaire_templates`, `questionnaire_assignments`, `questionnaire_responses` (3).
**Interfaces :** Edge Fn **`expire-questionnaires`** (pg_cron 6h), handlers d'events sur `dossier.scheduled`, `dossier.completed`.
**FRs adressés :** FR-039, FR-040, FR-041, FR-042.

### C-10 : Complaints

**Responsabilité :** Qualiopi I31. Ouverture, investigation, assignation, résolution, auto-clôture J+30, export annuel.
**Tables :** `complaints`, `complaint_events` (2).
**Interfaces :** Server Actions `openComplaintAction`, `assignComplaintAction`, `resolveComplaintAction`.
**FRs adressés :** FR-043, FR-044, FR-045.

### C-11 : Billing

**Responsabilité :** génération factures à la clôture dossier (handler), édition, validation, suivi paiement manuel. **Stripe = V2.**
**Tables :** `invoices`, `invoice_lines`, `payments` (3).
**Interfaces :** Server Actions `editInvoiceAction`, `validateInvoiceAction`, `markPaidAction`. Handler `issue-final-invoice` sur event `dossier.closed`.
**FRs adressés :** FR-046, FR-047, FR-048.

### C-12 : Automation (Infra Events)

**Responsabilité :** outbox dispatcher, catalogue events typés Zod (57 events), handlers métier des 6 parcours intégrés. **Workflows custom no-code = V2.**
**Tables :** `infra.domain_events`, `infra.processed_events`, `infra.event_dead_letter`, `infra.workflows`, `infra.workflow_runs` (5).
**Interfaces :** Edge Fn **`dispatch-events`** (pg_cron 1 min), RPC `claim_events_for_dispatch(p_batch int)` (`FOR UPDATE SKIP LOCKED`).
**Détails :** [`docs/architecture/04-events-catalog.md`](./architecture/04-events-catalog.md), [ADR 0002](./architecture/adr/0002-outbox-pattern.md).
**FRs adressés :** FR-049, FR-050, FR-051.

### C-13 : Notification

**Responsabilité :** email transactionnel via Resend (templates React Email branded par OF), notifications in-app (table + Realtime).
**Tables :** `app.notifications` (1).
**Interfaces :** `shared/notification/resend.ts` (client unique), webhook Resend `/api/webhooks/resend` pour bounces.
**FRs adressés :** FR-052, FR-053.

### Composants transverses (infra)

- **`audit.audit_log`** (append-only via REVOKE UPDATE/DELETE) + triggers `audit_row` sur ~20 tables sensibles
- **`app.feature_flags`** (toggle progressif des features)
- **`reports.mv_*`** (vues matérialisées dashboards, refresh 15 min via cron)
- **Vue `app.v_dossiers_overview`** (lecture 360° optimisée pour la UI)

---

## Data Architecture

### Data Model (résumé)

**35 tables** réparties sur 4 schémas. Détail dans [`docs/architecture/02-schema-sql.md`](./architecture/02-schema-sql.md).

```
                    ┌──────────────────┐
                    │  organizations   │ ◄────── multi-tenant root
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐        ┌──────────┐         ┌──────────┐
   │ members │        │companies │         │formations│
   │profiles │        │ contacts │         │ modules  │
   │invitations       │ learners │         │ trainers │
   └─────────┘        └────┬─────┘         └────┬─────┘
                           │                    │
                           └──────────┬─────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │     DOSSIER      │ ◄── AGGREGATE RACINE
                            │  + modules       │      référence DOS-YYYY-NNNN
                            │  + trainers      │      9 invariants
                            │  + funders       │      15 events
                            │  + status hist.  │
                            └────────┬─────────┘
                                     │
              ┌──────────┬───────────┼──────────┬───────────┐
              ▼          ▼           ▼          ▼           ▼
        ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌─────────┐
        │sessions│ │attendance│ │document│ │qualiop.│ │question.│
        │        │ │  sheets  │ │signatur│ │checklis│ │responses│
        └────────┘ └──────────┘ └────────┘ └────────┘ └─────────┘
                                     │
                                     ▼
                              ┌────────────┐
                              │  invoices  │ ◄── à la clôture
                              └────────────┘
```

**Tout référence `organization_id` (RLS).** Tout document/émargement/questionnaire/facture se rattache à un `dossier_id`.

### Database Design — conventions

Détails dans [02-schema-sql.md](./architecture/02-schema-sql.md). En résumé :

- **UUID v7** (perf indexes B-tree, ordonnés temporellement)
- **Snake_case**, tables au pluriel
- **Triggers** : `set_updated_at`, `audit_row` (~20 tables), `guard_dossier_transitions`, `audit.deny_mutation`
- **Indexes** : systématique sur `(organization_id, created_at DESC)`, toutes les FK, colonnes filtrées par RLS
- **JSONB** uniquement pour structures hétérogènes (réponses questionnaires, payloads events, snapshots)
- **Enums Postgres** pour les statuts finis (compact + transitions claires)

### Data Flow (golden path — création dossier)

```
1. Browser submits wizard step 3
       │
       ▼
2. Server Action `createDossierAction`
   - safe-action injects ctx.organizationId from JWT
   - Zod re-validation
       │
       ▼
3. Use case `createDossier(input)`
   - hydrate or build Dossier aggregate (TS pure)
   - aggregate validates invariants → Result.ok(events) | Result.err(reason)
       │
       ▼
4. Repository.save(dossier)
   - Calls RPC `save_dossier(p_dossier jsonb, p_events jsonb[])`
   - SQL function: BEGIN TX
     - UPSERT dossiers + child rows
     - INSERT INTO infra.domain_events (1 row per event)
     - COMMIT
   - SECURITY DEFINER + guard organization_id
       │
       ▼
5. Response to browser
   - revalidateTag('dossier-list')
   - redirect to /dossiers/{id}
       │
       ▼ ASYNC (within ~30s)
6. pg_cron → Edge Fn `dispatch-events`
   - claim_events_for_dispatch(50) (FOR UPDATE SKIP LOCKED)
   - For each event:
     - Lookup handlers in registry
     - Idempotence check via processed_events(event_id, handler)
     - Call handler (e.g. generate-convention-document, send-convocation-email)
     - On success: INSERT processed_events
     - On fail: attempts++, next_retry_at = now + 2^attempts min
   - After 8 attempts: move to event_dead_letter + alert
```

---

## API Design

### API Architecture

**Pas d'API REST publique** au sens classique. L'app expose :

| Type | Usage | Auth |
|---|---|---|
| **Server Actions** (`'use server'`) | 100% des mutations métier internes | Cookie session (JWT) via `next-safe-action` |
| **Server Components queries** | 100% des reads internes | RLS via supabase-js bound à la session |
| **API routes** `/api/*` | Webhooks externes uniquement (Stripe V2, Zoom, Resend) | Signature provider vérifiée |
| **Edge Functions** (Supabase) | Effets de bord + tokens publics (signature apprenant, questionnaire apprenant) | HMAC JWT custom + `service_role` interne |
| **API routes** `/api/health` | Monitoring | Aucune (public) |
| **API routes** `/api/files/{id}` | Download signed URL relay | Cookie session + check RLS |

### "Endpoints" critiques (Server Actions principales)

| Action | Component | FRs |
|---|---|---|
| `signupOrganizationAction` | C-01 | FR-001 |
| `inviteMemberAction` | C-01 | FR-003 |
| `enableMfaAction` | C-01 | FR-004 |
| `createCompanyAction`, `createLearnerAction`, `importLearnersCsvAction` | C-02 | FR-006, 008, 009 |
| `createFormationAction`, `createTrainerAction` | C-03 | FR-010, 012 |
| **`createDossierAction`** (wizard 3-steps) | C-04 | FR-013 |
| `addModuleAction`, `assignTrainerAction`, `addFunderAction` | C-04 | FR-015, 016, 017 |
| **`scheduleDossierAction`** (transition critique) | C-04 | FR-018 |
| `activateDossierAction`, `closeDossierAction`, `reopenDossierAction` | C-04 | FR-019, 014 |
| `rescheduleSessionAction` | C-05 | FR-024 |
| `openAttendanceSheetAction`, `finalizeAttendanceSheetAction` | C-06 | FR-025, 028 |
| `requestDocumentGenerationAction`, `requestSignatureAction` | C-07 | FR-030, 031 |
| `markIndicatorNaAction` (Qualiopi) | C-08 | FR-034 |
| `requestQualiopiAuditExportAction` | C-08 | FR-037 |
| `openComplaintAction`, `assignComplaintAction`, `resolveComplaintAction` | C-10 | FR-043, 044 |
| `editInvoiceAction`, `validateInvoiceAction`, `markPaidAction` | C-11 | FR-047, 048 |

### Edge Functions (HTTP)

| Endpoint | Auth | Rôle |
|---|---|---|
| `POST /functions/v1/sign-document` | HMAC JWT custom (token email/QR) | Capture signature, hash, audit |
| `POST /functions/v1/answer-questionnaire` | HMAC JWT custom (token email) | Submit réponses, idempotent |
| `POST /functions/v1/generate-document` | Service role (call interne uniquement) | DOCX → PDF + hash |
| `POST /functions/v1/dispatch-events` | `CRON_SECRET` header | Dispatcher outbox |

### Authentication & Authorization

Détails dans [05-rls-policies.md](./architecture/05-rls-policies.md).

- **Auth** : Supabase Auth (email + magic link). MFA TOTP obligatoire pour `owner/admin/comptable`.
- **JWT custom claims** posés par **Auth Hook Supabase** : `organization_id`, `role`, `member_id`. **Sans ce hook, toutes les policies RLS cassent.**
- **Authz** : RLS Postgres avec helpers `app.current_organization_id()`, `app.has_role()`, `app.is_staff()`, `app.is_dossier_trainer(dossier_id)`.
- **5 rôles** : `owner` > `admin` > `gestionnaire` > `formateur` > `comptable` (périmètres distincts).
- **UI guards** : composant `<Can role="..." />` pour cacher l'UI — **la sécurité reste dans la RLS** (UI guard = UX seul).

---

## Non-Functional Requirements Coverage

### NFR-001 : Multi-tenant RLS strict

**Exigence :** toute table métier porte `organization_id`. 100% des tables ont RLS `enabled + forced`. Aucune query client ne traverse les frontières d'organisation.

**Solution archi :**
- Helper SQL `app.current_organization_id()` lit JWT custom claim (jamais d'input client)
- 1 policy par opération (SELECT/INSERT/UPDATE/DELETE), pas de `FOR ALL`
- `FORCE ROW LEVEL SECURITY` partout (sinon owner table bypasse)
- Tables `infra.*` n'ont pas de policies → invisibles côté client (accessibles uniquement service_role en Edge Fn)
- `service_role` confiné aux Edge Functions, jamais en client

**Validation :**
- pgTAP `rls_cross_tenant.sql` (boucle sur toutes tables avec `organization_id`)
- Script CI vérifie `ENABLE ROW LEVEL SECURITY + FORCE` sur 100% tables `app.*`
- Lint custom interdit import `service_role` côté client

### NFR-002 : Conformité Qualiopi — Preuves immuables

**Exigence :** hash SHA-256 sur preuves Qualiopi, audit trail complet append-only.

**Solution archi :**
- Hash SHA-256 calculé en Edge Fn `generate-document` et stocké en BDD
- Re-vérification hash à la consultation
- `audit.audit_log` append-only via trigger `audit.deny_mutation` (REVOKE UPDATE/DELETE)
- Trigger `audit_row` automatique sur ~20 tables sensibles
- Soft delete partout (`deleted_at`), hard delete uniquement via Edge Fn anonymisation

**Validation :** test pgTAP qui tente UPDATE/DELETE sur `audit.audit_log` → doit échouer.

### NFR-003 : RGPD — Droit à l'oubli

**Exigence :** anonymisation apprenant sans casser preuves Qualiopi conservées.

**Solution archi :**
- Edge Fn dédiée `anonymize-learner` réservée `owner`
- Champs identifiants → `anonymized_<uuid>` (idempotent)
- Signatures PNG : effacement définitif Storage
- Conservation références obligatoires Qualiopi (preuves restent, identité disparait)
- Audit trail de la demande dans `audit.audit_log`

### NFR-004 : Server Actions p95 < 300 ms

**Solution archi :**
- RPC Postgres pour opérations multi-tables (évite aller-retours JS)
- Vue `app.v_dossiers_overview` pour reads 360° en 1 query
- `unstable_cache` + `revalidateTag()` sur Server Components
- TanStack Query pour vues live (cache + dedupe)
- Indexes systématiques sur `(organization_id, created_at DESC)` + FK + colonnes RLS

**Validation :** OpenTelemetry tracing + dashboard p50/p95/p99, alerte si p95 > 500ms pendant 5 min.

### NFR-005 : Génération doc p95 < 5 s

**Solution archi :**
- Edge Function dédiée `generate-document` (Deno isolé, scale-to-zero)
- docxtemplater + PizZip en mémoire (pas d'I/O disque)
- Fallback async si > 8s : job + notification user

**Validation :** logs structurés `correlation_id` + métriques par fonction.

### NFR-006 : Mobile-first signatures & émargement

**Solution archi :**
- Route group **`(formateur)/`** = PWA installable, layout dédié sans sidebar
- Route group **`(apprenant)/`** = pages tokenisées sans auth, optimisé smartphone 375px
- Canvas signature : taille min 250×100 px, touch-events natifs
- Touch targets ≥ 44×44 px (charte UI)

**Validation :** test Playwright sur viewports 375/414/768, manuel iOS Safari + Chrome Android.

### NFR-007 : SLO 99.5% jours ouvrés

**Solution archi :**
- Railway auto-restart sur crash + multi-instance possible
- Supabase Pro = HA managé (multi-AZ Postgres)
- Health endpoint `/api/health` (DB ping + Storage + Edge Fn)
- Monitoring uptime externe (Better Stack ou équivalent)
- Page status publique
- Runbook incident `docs/runbooks/`

### NFR-008 : Idempotence outbox & tokens

**Solution archi :** détail [ADR 0002](./architecture/adr/0002-outbox-pattern.md).
- `infra.processed_events(event_id, handler_name)` UNIQUE
- Tokens HMAC + JWT consommés via INSERT dans `processed_events` AVANT le side-effect métier
- Retry exponentiel : `attempts++`, `next_retry_at = now() + 2^attempts min`, max 8
- Au-delà → `infra.event_dead_letter` + alerte ops

**Validation :** test integration replay event 10× → 1 seul side-effect observable.

### NFR-009 : Accessibilité WCAG AA

**Solution archi :**
- shadcn/ui (basé Radix) = primitives accessibles par défaut
- Labels ARIA explicites sur tous les champs (RHF + shadcn `Form`)
- Focus visible (Tailwind ring utility)
- Audit Axe DevTools en CI sur pages publiques

### NFR-010 : I18n FR-first

**Solution archi :**
- `shared/i18n/fr.json` + helper `t('namespace.key')`
- Lint custom interdit strings hardcodées
- Formats date/nombre via `Intl`
- Architecture prête à ajouter `en.json` sans refonte

### NFR-011 : Reproductibilité dev local

**Solution archi :**
- **Supabase CLI local** = Postgres + Auth + Storage + Edge Fn en Docker
- Scripts `pnpm` : `supabase:start`, `db:reset`, `db:test`, `db:types`
- `supabase/seed.sql` avec 1 OF + 2 dossiers exemples
- Setup README ≤ 15 min depuis machine vierge
- Tests pgTAP exécutables localement avant push

### NFR-012 : Coûts < 200 €/mois V1

**Solution archi :**
- Pas de provider à coût exponentiel (interdit AWS Lambda à grande échelle non capé)
- Supabase Pro fixe ~25$/mois
- Railway scale-to-zero hors trafic = ~20$/mois
- Resend 100k emails/mois = ~20$
- Total ciblé ~80 €/mois V1 (marge confortable vs 200 €)

**Validation :** dashboard coûts mensuel suivi, alerte > 250 €.

---

## Security Architecture

### Authentication

- **Supabase Auth** : email + magic link en V1 (password classique optionnel)
- **MFA TOTP** obligatoire pour `owner/admin/comptable` (FR-004)
- **JWT lifetime** : access token 1h, refresh token 30j (défaut Supabase, OK V1)
- **Auth Hook Supabase** custom (PL/pgSQL) pose les claims `organization_id`, `role`, `member_id` à l'émission du JWT

### Authorization

**RBAC** avec 5 rôles. Application :
- **Couche DB** : RLS Postgres (autorité)
- **Couche app** : `next-safe-action` wrapper `requireRoles([...])` + `<Can />` UI

Détails [05-rls-policies.md](./architecture/05-rls-policies.md).

### Data Encryption

- **In transit** : HTTPS partout (Cloudflare TLS, Supabase TLS, Railway TLS)
- **At rest** : Supabase Postgres chiffré par défaut (AES-256 AWS managed), Storage idem
- **Application secrets** : Supabase Vault + variables Railway (jamais en git)
- **Signed URLs Storage** : TTL court (5-15 min), regen côté serveur uniquement

### Security Best Practices

- **Input validation** : Zod schemas partagés client+serveur (jamais confiance au client)
- **SQL injection** : RPC paramétrées + Supabase JS lib (préparé)
- **XSS** : React échappe par défaut + CSP headers via Next.js
- **CSRF** : Server Actions Next.js = protection intégrée (origin check)
- **Rate limiting** : Railway + Cloudflare front, custom rate limit pour Edge Fn publiques (sign-document, answer-questionnaire)
- **Security headers** : `next.config.mjs` (HSTS, X-Frame, X-Content-Type, Referrer-Policy)
- **Secrets** : jamais loggés (lint custom interdit `console.log(req.headers)`)
- **Audit** : `audit.audit_log` append-only sur opérations sensibles

---

## Scalability & Performance

### Scaling Strategy

**Vertical d'abord, horizontal ensuite.**

| Composant | V1 | V2 (10-20 OF) | V3 (100+ OF) |
|---|---|---|---|
| Next.js (Railway) | 1 instance | 2-3 instances LB | Multi-region |
| Postgres (Supabase) | Pro plan partagé | Dedicated compute | Read replicas + connection pooler |
| Edge Functions | Default (scale-to-zero) | idem | Cap concurrency par fonction |
| Storage | Supabase Storage | idem | Migration S3 si > 50 Go |

**Pas de sharding DB V1.** Multi-tenancy = RLS, pas schéma-per-tenant (cf. ADR 0001).

### Performance Optimization

- **RPCs Postgres** pour opérations multi-tables (vs N+1 ORM)
- **Vues** `app.v_dossiers_overview` pour reads 360° en 1 query
- **Vues matérialisées** `reports.mv_org_kpis` refresh 15 min via cron (vs query lourdes à chaque page)
- **Indexes** systématiques (cf. conventions schéma)
- **Pas d'ORM** entre TS et SQL : supabase-js + types générés depuis le schéma (`pnpm db:types`)
- **Server Components** = streaming HTML, pas de JS lourd côté client

### Caching Strategy

| Niveau | Outil | Cas d'usage |
|---|---|---|
| **CDN** | Cloudflare (static assets) | JS/CSS Next.js, images publiques |
| **Edge cache Next.js** | `unstable_cache` + tags | Server Component reads (catalogue, listes paginées) |
| **Cache client React** | TanStack Query | Vues live, dashboards, formulaires riches |
| **DB** | Postgres query planner | Indexes + statistiques |
| **Pas de Redis V1** | — | Surdimensionné, ajouter si besoin réel |

**Invalidation :** `revalidateTag()` depuis Server Actions à chaque mutation.

### Load Balancing

- **Railway** gère le LB Next.js (round-robin sur N instances)
- **Supabase** : pgBouncer transaction pooler (connections DB)
- Health checks Railway → restart auto sur instance unhealthy

---

## Reliability & Availability

### High Availability

- **Supabase Pro** : Postgres multi-AZ managed
- **Railway** : multi-instance possible (V1 = 1 instance suffit selon scope)
- **Edge Functions** : Deno isolates répliqués géographiquement
- **Storage** : S3-compatible Supabase, durabilité 99.999999999%
- **DNS Cloudflare** : SLA 100% historique

### Disaster Recovery

| Métrique | Cible V1 | Mise en œuvre |
|---|---|---|
| **RPO** (Recovery Point Objective) | ≤ 24h | Supabase daily backup auto (Pro plan) |
| **RTO** (Recovery Time Objective) | ≤ 4h | Restauration backup + redéploiement |
| **PITR** (Point-In-Time Recovery) | Hors V1 | Plan supérieur Supabase si critique (à arbitrer) |

### Backup Strategy

- **DB** : Supabase Pro auto-backup quotidien (rétention 7j)
- **Storage** : pas de backup spécifique V1 (objets immuables hash-vérifiés)
- **Code** : GitHub
- **Secrets** : 1Password Vault ou équivalent (jamais en git)

### Monitoring & Alerting

- **Sentry** : erreurs frontend + backend (Server Components + Server Actions)
- **Supabase Logs** : Edge Functions, Postgres, Auth
- **Better Stack** (ou équivalent) : uptime `/api/health`, alertes Slack/email
- **Dashboard custom** `reports.mv_org_kpis` : KPIs métier (dossiers actifs, sessions du jour, etc.)
- **Alertes** : p95 actions > 500ms 5min, dead_letter count > 0, génération doc échec, signature échec
- **Runbooks** : `docs/runbooks/deployment.md`, `docs/runbooks/attendance.md` (à compléter)

---

## Integration Architecture

### External Integrations

| Service | Direction | Auth | Critique ? | Fallback |
|---|---|---|---|---|
| **Resend** | Sortant (email) + webhook entrant (bounce) | API key + webhook signature | Oui | File de retry interne, alerte ops |
| **Zoom API V1.5** | Sortant (create meeting) | OAuth client credentials + refresh | Non | Lien manuel saisi par formateur |
| **API SIRET INSEE** | Sortant (validation SIRET) | API key | Non | Saisie manuelle non vérifiée |
| **Sentry** | Sortant (errors) | DSN | Non (best-effort) | Logs locaux |
| **Stripe** | HORS V1 | — | — | Facturation manuelle |

**Pattern intégration :** wrapper TS dans `shared/integrations/<provider>/` avec interface stable (port). Implémentations swappables. Mock pour tests.

### Internal Integrations (event-driven)

**Communication inter-context = events outbox uniquement.** Pas d'import direct d'une feature dans une autre.

Exemple : `dossier.closed` (émis par C-04 Dossier) déclenche :
- C-07 Documents : génération attestation finale
- C-08 Qualiopi : recompute readiness
- C-11 Billing : génération facture draft
- C-13 Notification : email à l'apprenant

Le producteur ne sait rien des consommateurs. Couplage par contrat (event schema Zod), pas par référence.

### Message/Event Architecture

**Outbox pattern Postgres.** Détails [ADR 0002](./architecture/adr/0002-outbox-pattern.md) et [04-events-catalog.md](./architecture/04-events-catalog.md).

- **57 events V1**, schémas Zod versionnés, naming `<context>.<aggregate>.<verb-past>`
- **Producteur unique, consommateurs multiples**
- **Idempotence handler** via `(event_id, handler_name)` UNIQUE
- **Criticalité** : `must_deliver` (Qualiopi, signature, billing) vs `best_effort` (notif cosmétique)
- **Latence acceptée** : ~30s (dispatcher pg_cron 1 min)

---

## Development Architecture

### Code Organization

Voir [06-frontend.md](./architecture/06-frontend.md) pour structure détaillée. En résumé :

```
i-a-infinity-of/
├── apps/web/
│   ├── app/                     ← Next.js App Router (route groups par audience)
│   ├── features/                ← 13 bounded contexts DDD
│   │   └── <context>/
│   │       ├── domain/          ← TS pur (zéro framework)
│   │       ├── application/     ← use cases, ports
│   │       ├── infrastructure/  ← repos Supabase, mappers
│   │       └── ui/              ← schemas, actions, queries, components
│   ├── shared/                  ← cross-cutting (supabase, i18n, ui primitives)
│   └── tests/                   ← Vitest unit/integ + Playwright E2E
├── supabase/
│   ├── migrations/              ← SQL versionné (source de vérité schéma)
│   ├── functions/               ← Edge Functions Deno
│   ├── tests/                   ← pgTAP RLS tests
│   └── seed.sql
├── docs/                        ← architecture, prompts, runbooks
├── .cursor/rules/               ← conventions auto-attachées Cursor
├── CLAUDE.md                    ← contexte agents IA
├── nixpacks.toml + railway.json ← config déploiement
└── package.json + pnpm-workspace.yaml
```

### Module Structure (boundaries)

**Règles d'import :**
1. Un context **ne peut PAS importer** d'un autre context (sauf events via `_events/`).
2. Une couche ne peut importer **que** des couches inférieures : `ui → application → domain`, `infrastructure → domain`.
3. `domain/` n'importe **rien d'externe** (zéro `next`, `react`, `zod`, `@supabase/*`).
4. Communication inter-context = **events outbox uniquement**.

Vérification : ESLint custom rules + revue PR.

### Testing Strategy

| Niveau | Outil | Couverture cible | Quand |
|---|---|---|---|
| **Unit (domain)** | Vitest | **100%** invariants + transitions | À chaque commit (CI) |
| **Unit (use cases)** | Vitest + repos mock | 80% des use cases critiques | CI |
| **Integration (repo)** | Vitest + Supabase local | Repos Dossier + Document + Qualiopi | CI |
| **RLS (pgTAP)** | pgTAP | **100%** tables × opérations | CI (avant deploy) |
| **E2E (golden paths)** | Playwright | 6 parcours métier du doc 08 | CI nightly + pre-release |
| **A11y** | Axe DevTools | Pages publiques | CI |

**Pas de couverture % comme indicateur principal** — focus sur les invariants métier critiques et la RLS.

### CI/CD Pipeline

```
git push
  │
  ▼
GitHub Actions (parallel):
  ├── Lint (eslint + prettier check)
  ├── Typecheck (tsc --noEmit)
  ├── Test unit (vitest)
  ├── Test integration (vitest + supabase local)
  ├── Test RLS (pgTAP)
  ├── Build (next build)
  └── Test E2E nightly (Playwright on preview deploy)
  │
  ▼ (si tous verts + branche main)
Railway deploy auto
  ├── Run migrations (`supabase db push`)
  ├── Deploy Next.js (Railway)
  └── Deploy Edge Functions (`supabase functions deploy`)
  │
  ▼
Smoke test post-deploy (/api/health)
  │
  ▼
Notification Slack succès/échec
```

---

## Deployment Architecture

### Environments

| Env | Postgres | Next.js | Edge Fn | Usage |
|---|---|---|---|---|
| **Local dev** | Supabase CLI (Docker) | `pnpm dev` (localhost:3000) | `supabase functions serve` | Dev quotidien |
| **Preview** (PR) | Supabase Branch (DB éphémère par PR) | Railway preview deploy | Supabase staging | Review PR + QA |
| **Production** | Supabase Pro project | Railway production | Supabase prod | Pilotes |

**Parity :** migrations SQL identiques sur les 3 (versionnées en git, replay déterministe).

### Deployment Strategy

- **Rolling deploy** Railway (zero downtime, 2+ instances)
- **Migrations** appliquées avant déploiement app (forward-only, jamais de DROP destructif sans plan)
- **Feature flags** (`app.feature_flags`) pour activation progressive features risquées par OF
- **Rollback** : revert git → redeploy Railway. Migrations forward-only = pas de rollback DB automatique (procédure manuelle si schéma critique cassé).

### Infrastructure as Code

- **V1 = pas d'IaC complet.** Config minimale :
  - `nixpacks.toml` (Railway build)
  - `railway.json` (Railway deploy config)
  - `supabase/config.toml` (Supabase project)
  - `supabase/migrations/*.sql` (DB schema)
- **À considérer V2 :** Terraform si > 3 environnements ou > 5 services externes.

---

## Requirements Traceability

### Functional Requirements Coverage

| FR ID | FR | Components | Tables clés | Edge Fn / RPC |
|---|---|---|---|---|
| FR-001 | Création OF | C-01 | `organizations`, `members` | — |
| FR-002 | Rôles | C-01 | `members` | Helpers SQL `app.has_role()` |
| FR-003 | Invitations | C-01, C-13 | `invitations` | Resend |
| FR-004 | MFA TOTP | C-01 | `profiles` (TOTP secret encrypted) | Supabase Auth |
| FR-005 | Switch org | C-01 | `members` | Auth Hook (re-emit JWT) |
| FR-006 | CRUD entreprises | C-02 | `companies` | — |
| FR-007 | Contacts entreprise | C-02 | `contacts` | — |
| FR-008 | CRUD apprenants | C-02 | `learners` | — |
| FR-009 | Import CSV apprenants | C-02 | `learners` | Edge Fn `import-learners-csv` (job async) |
| FR-010 | Formation template | C-03 | `formations`, `formation_modules` | — |
| FR-011 | Modules | C-03 | `modules` | — |
| FR-012 | Bibliothèque formateurs | C-03 | `trainers`, `trainer_competencies` | — |
| FR-013 | Wizard dossier 3-steps | C-04 | `dossier_drafts`, `dossiers` | `save_dossier` RPC |
| FR-014 | Cycle de vie dossier | C-04 | `dossiers`, `dossier_status_history` | Trigger `guard_dossier_transitions` |
| FR-015 | Modules dossier | C-04 | `dossier_modules` | — |
| FR-016 | Assignation formateurs | C-04 | `dossier_trainers` | — |
| FR-017 | Financeurs | C-04 | `dossier_funders` | — |
| FR-018 | Schedule dossier | C-04, C-05, C-13 | `dossiers`, `sessions` | Handlers events |
| FR-019 | Activate dossier | C-04 | `dossiers` | — |
| FR-020 | Brouillon dossier | C-04 | `dossier_drafts` | Cron purge J+7 |
| FR-021 | Sessions par défaut | C-05 | `sessions` | Handler `dossier.scheduled` |
| FR-022 | Calendrier formateur | C-05 | `sessions` | RLS `is_dossier_trainer` |
| FR-023 | Zoom V1.5 | C-05 | `sessions` (zoom_url) | Edge Fn `create-zoom-meeting` |
| FR-024 | Replanification session | C-05, C-13 | `sessions` | Handler email |
| FR-025 | Ouverture émargement | C-06 | `attendance_sheets` | — |
| FR-026 | Signature mobile QR | C-06 | `attendance_signatures` | Edge Fn `sign-document` |
| FR-027 | Vue temps réel | C-06 | `attendance_signatures` | Supabase Realtime |
| FR-028 | Finalisation + PDF | C-06 | `attendance_sheets` | Edge Fn `generate-attendance-document` |
| FR-029 | Templates DOCX | C-07 | `document_templates`, `document_template_versions` | Storage |
| FR-030 | Génération doc | C-07 | `documents` | Edge Fn `generate-document` |
| FR-031 | Demande signature | C-07, C-13 | `document_signatures` | Resend |
| FR-032 | Signature canvas | C-07 | `document_signatures` | Edge Fn `sign-document` |
| FR-033 | Attachement preuve Qualiopi | C-07, C-08 | `qualiopi_proofs` | Handler `attach-signature-as-qualiopi-proof` |
| FR-034 | Checklist Qualiopi 32 | C-08 | `qualiopi_indicators`, `qualiopi_dossier_checklists` | Edge Fn `compute-qualiopi-readiness` |
| FR-035 | Closing checklist | C-04, C-08 | `qualiopi_dossier_checklists` | Port `QualiopiReadinessPort` |
| FR-036 | Dashboard Qualiopi | C-08 | `qualiopi_dossier_checklists`, vue dédiée | — |
| FR-037 | Export audit annuel | C-08 | toutes preuves | Edge Fn `qualiopi-audit-export` (job async) |
| FR-038 | Notif preuves manquantes | C-08, C-13 | `qualiopi_dossier_checklists` | Cron pg_cron daily |
| FR-039 | Templates questionnaires | C-09 | `questionnaire_templates` | — |
| FR-040 | Assignation auto | C-09 | `questionnaire_assignments` | Handlers events dossier |
| FR-041 | Réponse apprenant | C-09 | `questionnaire_responses` | Edge Fn `answer-questionnaire` |
| FR-042 | Relances & expiration | C-09, C-13 | `questionnaire_assignments` | Edge Fn `expire-questionnaires` |
| FR-043 | Ouverture réclamation | C-10 | `complaints`, `complaint_events` | — |
| FR-044 | Investigation | C-10 | `complaint_events` | Auto-clôture cron J+30 |
| FR-045 | Export réclamations | C-08, C-10 | `complaints` | Inclus export Qualiopi |
| FR-046 | Génération facture | C-11 | `invoices`, `invoice_lines` | Handler `issue-final-invoice` |
| FR-047 | Édition + validation | C-11 | `invoices` | Edge Fn `generate-document` (PDF) |
| FR-048 | Suivi paiement manuel | C-11 | `payments` | — |
| FR-049 | Outbox dispatcher | C-12 | `infra.domain_events`, `processed_events`, `event_dead_letter` | Edge Fn `dispatch-events` + RPC `claim_events_for_dispatch` |
| FR-050 | Catalogue events Zod | C-12 | `infra.domain_events` | `_events/registry.ts` |
| FR-051 | Handlers 6 parcours | C-12 | — | `dispatch-events/handlers/*` |
| FR-052 | Email Resend | C-13 | `app.notifications` | Webhook bounce `/api/webhooks/resend` |
| FR-053 | Notif in-app | C-13 | `app.notifications` | Supabase Realtime |

**Couverture :** 53/53 FRs adressés. ✓

### Non-Functional Requirements Coverage

| NFR ID | NFR | Solution archi | Validation |
|---|---|---|---|
| NFR-001 | Multi-tenant RLS | Helper SQL + 1 policy/op + FORCE + JWT custom claim | pgTAP cross-tenant + script CI |
| NFR-002 | Preuves Qualiopi immuables | Hash SHA-256 + `audit.audit_log` append-only + triggers | pgTAP `deny_mutation` |
| NFR-003 | RGPD droit oubli | Edge Fn `anonymize-learner` réservée owner | Audit trail demande |
| NFR-004 | Server Actions p95 < 300ms | RPCs + vues + caches + indexes | OpenTelemetry, alerte > 500ms |
| NFR-005 | Génération doc p95 < 5s | Edge Fn dédiée + fallback async > 8s | Logs structurés correlation_id |
| NFR-006 | Mobile-first | Route groups `(formateur)` PWA + `(apprenant)` tokenisé | Playwright 375/414/768 |
| NFR-007 | SLO 99.5% | Supabase HA managé + Railway multi-instance + health endpoint | Better Stack monitoring |
| NFR-008 | Idempotence | `processed_events` UNIQUE + retry exp + dead letter | Test replay event ×10 |
| NFR-009 | A11y WCAG AA | shadcn/Radix + labels ARIA + focus visible | Axe CI |
| NFR-010 | I18n FR-first | `shared/i18n/fr.json` + lint anti-hardcoded | Lint |
| NFR-011 | Reproductibilité dev local | Supabase CLI + seed + setup ≤ 15min | README test setup |
| NFR-012 | Coûts < 200 €/mois | Stack contrôlé, pas de provider exponentiel | Dashboard mensuel |

**Couverture :** 12/12 NFRs adressés. ✓

---

## Trade-offs & Decision Log

### Décisions structurantes (ADRs existants)

- **[ADR 0001](./architecture/adr/0001-modular-monolith.md)** — Modular monolith, pas microservices
- **[ADR 0002](./architecture/adr/0002-outbox-pattern.md)** — Outbox pattern Postgres, pas Kafka/RabbitMQ

### Trade-offs additionnels documentés ici

| Décision | Gain | Perte | Pourquoi malgré tout |
|---|---|---|---|
| Server Actions par défaut, pas REST API publique | Type-safety bout-en-bout, pas de duplication client/server, vélocité | Pas de mobile native facile, pas d'intégrations 3rd party out-of-the-box | V1 = web only, intégrations = webhooks ponctuels. Refondre en API REST si mobile natif V3 |
| Pas d'ORM (supabase-js + types générés) | Performance, contrôle SQL, pas d'abstraction qui fuit | Boilerplate sur reads complexes | RPCs + vues compensent. Évite Prisma overhead et lock-in |
| RLS comme source d'autorité, pas une couche app | Sécurité au niveau DB (incontournable), simplifie code app | Tests pgTAP obligatoires (courbe d'apprentissage), debug parfois opaque | Le coût d'une faille RLS > coût des tests. ROI clair |
| 1 outbox Postgres, pas Kafka | Atomicité parfaite, observabilité native, coût zéro | Latence ~30s, throughput limité Postgres | Notre échelle V1-V2 le tolère largement. Migration si besoin = 1 trigger de réévaluation explicite |
| Apprenants sans compte V1 (token-only) | Friction zéro signature, pas de gestion mot de passe | Pas d'historique persistant côté apprenant | V1 = focus OF, portail apprenant = V2 |
| Pas de Redis V1 | Une dépendance en moins, coût zéro | Pas de cache distribué partagé | `unstable_cache` Next.js + TanStack Query suffisent à notre échelle |
| Pas d'IaC complet (Terraform) | Setup + maintenance évités | Reproductibilité infra moindre | 1 env prod, 1 staging, simple. À reconsidérer V2 si > 3 environnements |
| FR-quasi-tous "Must Have" | Couverture fonctionnelle complète V1 | Risque délai 3 mois pilote | Priorisation faite en amont au niveau epics (cf. PRD Risques de scope) |

---

## Open Issues & Risks

### Décisions arbitrées (2026-05-16)

1. **✅ Auth Hook Supabase — RÉSOLU.** Implémentation = **Database Function PL/pgSQL `before_token_emit`** (~30 lignes), lit `members(user_id)` et injecte claims `organization_id`, `role`, `member_id` dans le JWT. Pour multi-org (FR-005), lecture depuis `profiles.active_organization_id` que la Server Action `switchOrganizationAction` met à jour avant un refresh JWT côté client. **Détail : [ADR 0003](./architecture/adr/0003-auth-hook-pl-pgsql.md).**
   *Action Sprint 0 : écrire la fonction + test pgTAP qui force émission JWT et vérifie les claims.*

2. **✅ DOCX → PDF — RÉSOLU.** **DOCX-only par défaut**, **PDF généré via gotenberg self-host Railway** uniquement pour preuves Qualiopi terminales : (a) attestation de fin de formation, (b) feuille d'émargement finalisée, (c) facture validée. Coût ~+5$/mois (instance Railway dédiée). Fidélité PDF parfaite (LibreOffice headless). Edge Fn `generate-document` appelle l'endpoint HTTP gotenberg interne. **Détail : [ADR 0004](./architecture/adr/0004-gotenberg-pdf-qualiopi.md).**
   *Action Sprint 0 : déployer gotenberg sur Railway, secret `GOTENBERG_URL` dans Edge Fn.*

3. **✅ Tokens HMAC — RÉSOLU.** Pas de rotation V1. Pour la durée pilote (3 mois, 1-3 OF), runbook d'urgence documenté : *compromise → reset `TOKEN_SIGNING_KEY` → tous tokens en vol invalidés → ré-émission requise (signatures pending re-envoyées par batch)*. Mesures V1 immédiates : (a) rate limit IP sur Edge Fn `sign-document` et `answer-questionnaire`, (b) audit du payload JWT (zéro claim sensible en clair, uniquement IDs), (c) HSTS + secure cookies. Schéma 2-clés (current+previous) reporté V2. **Runbook : [docs/runbooks/token-key-rotation.md](./runbooks/token-key-rotation.md).**

4. **✅ Auth Hook + branches preview Supabase — RÉSOLU (en partie).** Décision : à **vérifier au Sprint 0** lors du premier branch preview. Si incompatibilité, fallback = désactiver Auth Hook sur previews et seed un user de test pré-claims. Pas de décision structurante à prendre maintenant.

5. **✅ PITR — RÉSOLU.** Pas de PITR V1. Backup daily Supabase Pro suffit pour pilote 1-3 OF, RPO 24h accepté, cohérent NFR-012 (cible coûts < 200 €/mois). Runbook : *si crash > 6h post-backup, communiquer aux OF la perte potentielle d'une journée et accompagner la re-saisie*. Upgrade plan Supabase Team (avec PITR) à la signature de la 1ʳᵉ facture pilote payante (V1.5). **Runbook : [docs/runbooks/backup-recovery.md](./runbooks/backup-recovery.md).**

### Issues résiduelles / nouvelles à surveiller

- **Auth Hook PL/pgSQL** : PL/pgSQL est moche à débugger. Tester via pgTAP en CI à chaque modification.
- **Gotenberg uptime** : single point of failure pour les preuves Qualiopi terminales. Fallback : retry + dead letter event `documents.pdf.generation_failed` + alerte ops + livraison DOCX provisoire.
- **Rate limit Edge Fn** : implémentation à choisir (Upstash Redis, in-memory PG, etc.). À arbitrer Sprint 0.

### Risques opérationnels (rappelés du PRD)

| Risque | Probabilité | Impact | Mitigation archi |
|---|---|---|---|
| Sous-estimation Epic 04 (Dossier CORE) | Haute | Critique | Sanctuariser 2 sprints, agréger `Dossier` testé 100% en domain |
| Bug RLS critique en prod | Faible | Catastrophique | Test pgTAP `rls_cross_tenant.sql` exhaustif + audit RLS avant chaque release |
| Émargement mobile bug iOS Safari | Moyenne | Élevé | POC précoce iOS Safari signature canvas, fallback signature texte |
| Coûts Storage signatures explosent | Faible V1 | Élevé V2 | Monitoring Storage, plan migration S3 si > 50 Go |
| Auth Hook Supabase cassé | Faible | Catastrophique (RLS down) | Test integration au déploiement + alerte `/api/health` |
| Latence dispatcher events trop élevée | Moyenne | Moyen | Si > 1 min métier-bloquant, passer pg_cron 10s ou notify_listen Postgres |

---

## Assumptions & Constraints

### Assumptions techniques

1. Supabase Pro tient la charge V1 (1-3 OF × ~100 dossiers/an = ~300 dossiers/an, négligeable).
2. Resend délivre 100k emails/mois sans throttling (limite plan).
3. Zoom API V1.5 stable pendant la durée du pilote.
4. Templates DOCX initiaux fournis (Ismael ou pilote OF), pas à concevoir from scratch.
5. Pas d'audit Qualiopi externe sur les pilotes pendant 3 premiers mois (sinon risque produit non-prêt à temps).
6. Signature canvas + hash + audit trail = niveau eIDAS "signature simple" suffisant pour conventions formation.

### Constraints

- **Stack imposée** (cf. CLAUDE.md) — non négociable sans ADR
- **Ismael = dev solo principal** — capacité de livraison calibrée en conséquence
- **Pas de microservices** (ADR 0001)
- **Pas d'event sourcing complet** (ADR 0001)
- **Pas de schéma DB par tenant** (ADR 0001)
- **Pas de broker externe** (ADR 0002)

---

## Future Considerations

### V2 (10-20 OF payants, T+6 mois)

- **Stripe intégration complète** (paiement client + abonnement OF)
- **Portail apprenant authentifié** (espace perso historisé, téléchargement attestations)
- **Portail entreprise cliente** (vue sur ses formations)
- **Workflows custom no-code** (Epic 12 V2 — utilisateur configure ses propres règles d'automation)
- **App mobile native** (iOS/Android) — refonte API REST nécessaire ou GraphQL
- **Multi-langues UI** (EN, ES) — i18n déjà prête

### V3 (50+ OF, T+12 mois)

- **Read replicas Postgres** + connection pooler
- **Migration Storage S3** si > 50 Go
- **CDN images** dédié
- **Multi-region** Railway si clients internationaux
- **Terraform / Pulumi** pour IaC
- **Marketplace formateurs** (matching, paiement) si demandé

### Triggers de réévaluation archi

(Reprenant ADRs existants)

- Équipe > 8 devs → reconsidérer microservices (ADR 0001)
- Un context > 30k LOC → extraction service possible (ADR 0001)
- Outbox latence > 1 min métier-bloquant → notify/listen ou broker (ADR 0002)
- `infra.domain_events` > 10M lignes → partitionnement mensuel (ADR 0002)

---

## Approval & Sign-off

- [ ] Technical Lead (Ismael — auto)
- [ ] Product Owner (Ismael — auto)
- [ ] Security review (à organiser avant prod)
- [ ] OF pilote tech review (post-démo)

---

## Revision History

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 2026-05-16 | Ismael Lepennec | Architecture initiale (consolidation BMAD des `docs/architecture/01-09-*.md` + ADRs + traçabilité PRD) |

---

## Next Steps

### Phase 4 : Sprint Planning

Lancer `/bmad:sprint-planning`. Découpage en stories Vertical Slice par epic. Séquencement V1 suggéré (rappel PRD) :

1. **Sprint 0 — Fondations infra** : Auth Hook Supabase + RLS helpers + outbox dispatcher + email Resend (EPIC-01 partiel + EPIC-12 + EPIC-13)
2. **Sprint 1 — Identity & CRM & Catalog** : EPIC-01 reste + EPIC-02 + EPIC-03
3. **Sprints 2-3 — Dossier (CORE)** : EPIC-04 entier (2 sprints sanctuarisés)
4. **Sprint 4 — Scheduling + Attendance** : EPIC-05 + EPIC-06
5. **Sprint 5 — Documents + Questionnaires** : EPIC-07 + EPIC-09
6. **Sprint 6 — Qualiopi + Complaints** : EPIC-08 + EPIC-10
7. **Sprint 7 — Billing + polish + beta pilote** : EPIC-11 + onboarding pilote

**Principes d'implémentation à respecter :**
1. Suivre les boundaries de contexte définies ici (pas d'import inter-context, events outbox uniquement)
2. Couche `domain` pure (zéro framework)
3. Tests pgTAP RLS exhaustifs avant chaque release
4. Génération doc + email = Edge Functions Deno
5. `service_role` confiné aux Edge Functions, jamais en client

---

*Ce document a été créé via BMAD Method v6 — Phase 3 (Solutioning).*
*Suite : `/bmad:workflow-status` ou `/bmad:sprint-planning`.*

---

## Appendix A : Technology Evaluation Matrix

| Domaine | Choix | Alternatives écartées | Pourquoi |
|---|---|---|---|
| Framework web | Next.js 14 App Router | Remix, SvelteKit, Astro | Server Actions native, écosystème mature, déploiement simple |
| BaaS | Supabase | Firebase, AWS Amplify, Convex | Postgres natif (vs NoSQL), RLS, prix prévisible, open source |
| Auth | Supabase Auth | Auth0, Clerk, NextAuth | Intégré BaaS, JWT custom claims supportés, MFA TOTP |
| Email | Resend | SendGrid, Postmark, AWS SES | DX, React Email templates, prix V1, webhooks bounces |
| Hosting | Railway | Vercel, Fly.io, Render | Prix linéaire, pas de surprise function invocations, scale horizontal simple |
| Cron | pg_cron | Vercel Cron, Inngest, EventBridge | Intégré Supabase, observabilité SQL native, zéro coût supplémentaire |
| Workflow async | Outbox Postgres custom | Kafka, RabbitMQ, Inngest, Temporal | Zéro dépendance externe, atomicité, suffit à notre échelle (cf. ADR 0002) |
| ORM | Aucun (supabase-js + types générés) | Prisma, Drizzle, Kysely | Pas d'abstraction qui fuit, perf, types depuis schéma SQL |
| Forms | RHF + Zod | Formik, Final Form | Performance, schémas partagés client/server |
| State | Zustand (si besoin) | Redux Toolkit, Jotai, Recoil | Minimal, sortie facile |
| Tests E2E | Playwright | Cypress, Puppeteer | Multi-browser, debugging excellent, prix gratuit |
| Error monitoring | Sentry | Datadog, Bugsnag | Free tier généreux V1, intégration Next.js solide |

---

## Appendix B : Capacity Planning

**Volumétrie V1 estimée (1-3 OF × scope nominal) :**

| Métrique | Volume V1 | Volume V2 (×10) | Volume V3 (×100) |
|---|---|---|---|
| Organizations | 3 | 20 | 200 |
| Members | 30 | 200 | 2000 |
| Dossiers / an | 300 | 3 000 | 30 000 |
| Sessions / an | 1 500 | 15 000 | 150 000 |
| Signatures / an | 5 000 | 50 000 | 500 000 |
| Documents générés / an | 3 000 | 30 000 | 300 000 |
| Storage (signatures + docs) | ~5 Go | ~50 Go | ~500 Go |
| Events outbox / mois | ~10 000 | ~100 000 | ~1 000 000 |
| DB rows totales V1 | ~50 000 | ~500 000 | ~5 000 000 |

**Conclusion :** dimensionnement Supabase Pro confortable jusqu'à V2 inclus. V3 = compute dedicated + read replicas + migration Storage à S3.

---

## Appendix C : Cost Estimation V1

| Service | Plan | Coût mensuel | Notes |
|---|---|---|---|
| Supabase | Pro | 25 $/mois | Inclut HA, daily backups, 8 Go DB, 100 Go Storage |
| Railway (Next.js) | Hobby / Pro | 5-20 $/mois | Scale-to-zero si trafic faible |
| Railway (Gotenberg) | Hobby | ~5 $/mois | Instance dédiée pour PDF Qualiopi |
| Resend | Pay-as-you-go | 0-20 $/mois | 3000 emails/mois gratuit, ensuite 0.001$/email |
| Cloudflare | Free | 0 $/mois | DNS + TLS |
| Sentry | Developer | 0 $/mois | Free tier 5k events/mois |
| Better Stack (uptime) | Free | 0 $/mois | 1 monitor 3min |
| Domaine | OVH/Cloudflare | 1-2 $/mois | .com ou .fr |
| **TOTAL V1** | | **~55-85 $/mois** | Très en-dessous cible 200 €/mois NFR-012 |

**V2 (10-20 OF actifs) :** estimer ~150-250 $/mois (montée Storage, emails, Sentry events). Cible NFR-012 ajustée.
