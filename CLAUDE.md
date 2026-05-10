# CLAUDE.md

Contexte projet pour les sessions Claude Code (et autres agents IA).

## Projet

**i-a-infinity OF** — SaaS B2B pour organismes de formation français. TMS/CRM orienté Qualiopi, multi-tenant, événementiel. **Pas un LMS.**

## Stack imposée

- Next.js 14 App Router · TypeScript strict (`noUncheckedIndexedAccess`)
- Supabase (Postgres + Auth + Storage + RLS + Edge Functions + pg_cron + Realtime)
- TailwindCSS + shadcn/ui + React Hook Form + Zod + TanStack Query
- next-safe-action pour les Server Actions

## Architecture (résumé)

- **Modular monolith**, jamais microservices.
- **Multi-tenant** via `organization_id` + RLS (jamais schéma par tenant).
- **Event-driven** via outbox pattern dans `infra.domain_events` (pas de broker externe).
- **DDD light** : bounded contexts en dossiers, pas en services.
- **Aggregate racine = Dossier** (relie apprenant + entreprise + formation + formateur + financeur).

## Bounded contexts

`identity`, `crm`, `catalog`, `dossier` (root), `scheduling`, `attendance`, `documents`, `qualiopi`, `questionnaire`, `complaint`, `billing`, `automation`, `notification`.

## Règles dures (red lines)

1. Jamais bypass RLS depuis le client. `service_role` uniquement dans Edge Functions et webhooks (avec guard explicite).
2. Toute nouvelle table → enable + force RLS, policies par opération, test pgTAP.
3. Domain layer pur : zéro import de `next`, `@supabase/*`, `react`, `zod`.
4. Server Components par défaut, Server Actions wrappés via `authActionClient`.
5. Schémas Zod **partagés** entre forms et Server Actions (jamais dupliqués).
6. Pas de `any`, pas de `try/catch` qui avale silencieusement, pas de comment qui décrit le QUOI.
7. `Result<T, E>` pour les erreurs métier attendues. `throw` réservé aux bugs.
8. Branded UUIDs (`DossierId`, `LearnerId`...). Jamais de `string` brut pour les IDs.

## Documentation

- Architecture détaillée : `docs/architecture/01-09-*.md`
- Prompts opérationnels : `docs/prompts/`
- Rules Cursor (auto-attachées) : `.cursor/rules/*.mdc`
- Windsurf : `.windsurfrules`

## Ordre de développement d'une feature

1. Migration SQL (table, indexes, RLS enable)
2. Domain (entités, VO, events, errors, invariants + tests)
3. Application (ports + commands + queries)
4. Infrastructure (Supabase repository + mappers)
5. RLS policies + pgTAP tests
6. UI schemas + Server Actions + queries
7. Pages + components
8. Test E2E du golden path

## Commandes

```bash
pnpm dev                    # Next.js
pnpm typecheck              # tsc --noEmit
pnpm test                   # Vitest unit + integration
pnpm test:e2e               # Playwright
pnpm db:reset               # Replay migrations en local
pnpm db:test                # Tests pgTAP RLS
pnpm db:types               # Regénère shared/types/database.ts
```

## En cas de doute

Lis la rule appropriée dans `.cursor/rules/`, puis le livrable concerné dans `docs/architecture/`. Ne dévie pas du pattern sans demander.
