# i-a-infinity OF

SaaS de gestion d'organismes de formation : TMS/CRM Qualiopi, multi-tenant, événementiel.

> **Pas un LMS.** Plateforme métier pour OF français : gestion administrative, conformité Qualiopi, financeurs publics, automatisations.

## Stack

- **Frontend** : Next.js 14 App Router, TypeScript strict, TailwindCSS, shadcn/ui, React Hook Form, Zod, TanStack Query
- **Backend** : Supabase (Postgres + Auth + Storage + RLS + Edge Functions + pg_cron + Realtime)
- **Infra** : Railway (web), Supabase (DB+Edge), Resend (email)

## Arborescence

```
.
├── apps/web/                # Next.js 14 monolithe modulaire
│   ├── app/                 # App Router (route groups: auth, dashboard, formateur, apprenant)
│   ├── features/            # bounded contexts (DDD)
│   │   ├── _events/         # catalogue Zod des domain events
│   │   └── dossier/         # agrégat racine
│   │       ├── domain/
│   │       ├── application/
│   │       ├── infrastructure/
│   │       └── ui/
│   ├── shared/              # utilitaires cross-feature
│   └── tests/
├── supabase/
│   ├── migrations/          # SQL versionné (source de vérité)
│   ├── functions/           # Edge Functions (Deno)
│   └── tests/               # pgTAP RLS tests
├── docs/
│   ├── architecture/        # 9 livrables consolidés
│   └── prompts/             # kit Cursor / Windsurf
├── .cursor/rules/           # rules architecturales (toujours en contexte IA)
└── .windsurfrules
```

## Démarrage rapide

```bash
# 1. Pré-requis : Node 20.18+, pnpm 9+, Docker (pour Supabase local)
brew install pnpm supabase/tap/supabase

# 2. Installer
pnpm install

# 3. Démarrer Supabase local
pnpm supabase:start

# 4. Variables d'environnement
cp .env.example apps/web/.env.local
# → remplir SUPABASE_*, TOKEN_SIGNING_KEY, CRON_SECRET (cf. .env.example)

# 5. Jouer les migrations
pnpm db:reset

# 6. Générer les types DB
pnpm db:types

# 7. Lancer le dev
pnpm dev
```

## Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm dev` | Lance Next.js sur :3000 |
| `pnpm build` | Build production |
| `pnpm typecheck` | Vérifie les types TS |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit + integration |
| `pnpm test:e2e` | Playwright |
| `pnpm db:reset` | Reset DB local + replay migrations |
| `pnpm db:types` | Regénère `shared/types/database.ts` |
| `pnpm db:test` | Tests pgTAP (RLS) |

## Documentation

L'**intégralité** de l'architecture est documentée dans `docs/architecture/` :

| Fichier | Contenu |
|---|---|
| [01-vision-architecture.md](docs/architecture/01-vision-architecture.md) | Vision globale, principes, découpage |
| [02-schema-sql.md](docs/architecture/02-schema-sql.md) | Schéma SQL complet (35 tables) |
| [03-domain-models.md](docs/architecture/03-domain-models.md) | Modèles DDD (Dossier en référence) |
| [04-events-catalog.md](docs/architecture/04-events-catalog.md) | Catalogue d'events Zod (57 events) |
| [05-rls-policies.md](docs/architecture/05-rls-policies.md) | RLS policies + tests pgTAP |
| [06-frontend.md](docs/architecture/06-frontend.md) | Arborescence + feature de référence |
| [07-edge-functions.md](docs/architecture/07-edge-functions.md) | Edge Functions clés |
| [08-workflows.md](docs/architecture/08-workflows.md) | 6 parcours métier |
| [09-wireframes.md](docs/architecture/09-wireframes.md) | 8 écrans clés |

Le kit de prompts pour Cursor/Windsurf est dans [docs/prompts/](docs/prompts/).

## Convention de contribution

- **Le `Dossier` est l'agrégat racine.** Toute fonctionnalité métier s'y rattache.
- **Multi-tenant via `organization_id` + RLS, jamais autrement.**
- **Outbox pattern (`infra.domain_events`) pour l'asynchrone, pas de broker externe.**
- **Server Actions par défaut.** API routes uniquement pour webhooks et streaming.
- **Domain layer pur** : zéro import depuis `next`, `@supabase/*`, `react`, `zod`.
- **Tests pgTAP obligatoires** sur toute nouvelle table avec RLS.

Voir [`.cursor/rules/`](.cursor/rules/) pour le détail des règles architecturales.

## Licence

Propriétaire — i-a-infinity. Tous droits réservés.
