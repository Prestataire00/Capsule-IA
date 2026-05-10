# Architecture — i-a-infinity OF

Cette section décrit l'architecture en 9 documents. **L'autorité est le code** : si un doc diverge, le code gagne.

## Index

| # | Document | Contenu | Source code |
|---|---|---|---|
| 01 | [Vision architecture](01-vision-architecture.md) | Principes, découpage, communication entre modules | `.cursor/rules/00-core-architecture.mdc` |
| 02 | [Schéma SQL](02-schema-sql.md) | 35 tables, enums, indexes, conventions | `supabase/migrations/0001-0017_*.sql` |
| 03 | [Domain models TS](03-domain-models.md) | DDD light, agrégat Dossier de référence | `apps/web/features/dossier/domain/` |
| 04 | [Catalogue d'events Zod](04-events-catalog.md) | 57 events typés, registre, métadonnées | `apps/web/features/_events/` |
| 05 | [RLS policies](05-rls-policies.md) | Sécurité multi-tenant, helpers, tests pgTAP | `supabase/migrations/0018-0023_rls_*.sql` |
| 06 | [Frontend](06-frontend.md) | App Router, Server Actions, feature de référence | `apps/web/app/`, `apps/web/features/dossier/` |
| 07 | [Edge Functions](07-edge-functions.md) | RPCs, dispatcher, génération doc, signature | `supabase/migrations/0024_rpc_*.sql`, `supabase/functions/` |
| 08 | [Workflows métier](08-workflows.md) | 6 parcours métier détaillés (création → clôture) | (pas de code direct ; design doc) |
| 09 | [Wireframes](09-wireframes.md) | 8 écrans clés ASCII, états, breakpoints | (pas de code direct ; design doc) |

## ADR (décisions structurantes)

À écrire au fil des choix importants. Voir [adr/](adr/).

## Comment naviguer

- Tu cherches **le schéma d'une table** ? → `supabase/migrations/000N_*.sql`.
- Tu cherches **comment un event est typé** ? → `apps/web/features/_events/<context>.events.ts`.
- Tu cherches **comment écrire une feature** ? → 06 (frontend) + `docs/prompts/`.
- Tu cherches **les invariants métier** ? → 03 (domain) + `apps/web/features/dossier/domain/`.
- Tu cherches **la sécurité d'une table** ? → 05 (RLS) + `supabase/migrations/0019+_rls_*.sql`.
