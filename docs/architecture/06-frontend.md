# 06 — Frontend

**Source de vérité : `apps/web/app/`, `apps/web/features/dossier/`, `apps/web/shared/`.**

## Routing (App Router)

Route groups par audience :

```
app/
├── (public)/          ← catalogue partageable
├── (auth)/            ← login, magic-link, invitation
├── (dashboard)/       ← espace OF (admin, gestionnaire, comptable)
├── (formateur)/       ← PWA simplifiée mobile-first
├── (apprenant)/       ← pages tokenisées (pas de login V1)
└── api/
    ├── webhooks/      ← Stripe, Zoom (signature vérifiée)
    └── health/
```

## Server vs Client

- **Server Components par défaut** pour les lectures.
- **Server Actions** pour les écritures, wrappés via `authActionClient` ou `requireRoles([...])`.
- **API routes** uniquement pour : webhooks externes, streaming de fichiers (download).
- `'use client'` à la feuille la plus profonde qui en a besoin (formulaire interactif, realtime).

## Pattern `features/<context>/ui/`

```
features/<context>/ui/
├── schemas.ts         ← Zod schemas PARTAGÉS forms ↔ Server Actions
├── actions.ts         ← Server Actions (auth + Zod + use case)
├── queries.ts         ← Server Component data fetchers (cached)
└── components/        ← components spécifiques au contexte
```

## next-safe-action

Toutes les Server Actions passent par `shared/lib/safe-action.ts` qui injecte automatiquement :

```ts
ctx.supabase           // RLS-bound
ctx.session
ctx.userId
ctx.organizationId     // depuis JWT claim
ctx.role
ctx.actorIp / ctx.actorUserAgent (depuis middleware)
```

## Caching

- **`unstable_cache`** côté Server Components avec tags explicites.
- **`revalidateTag(...)`** depuis les Server Actions.
- **TanStack Query** uniquement pour les vues live (realtime tabs, dashboards live).
- **Pas** de cache client générique pour le reste.

## Realtime

Pour les pages "vue 360" et émargement, un composant `<RealtimeBridge dossierId={...} />` s'abonne aux `postgres_changes` Supabase et fait `router.refresh()`.

## Forms

**React Hook Form + Zod resolver + shadcn `Form`**. Schémas dans `ui/schemas.ts`, **mêmes** pour le form (validation client-side au fil de l'eau) et la Server Action (re-validation serveur — ne jamais faire confiance au client).

## Permissions UI

Composant `<Can role="..." />` ou `<Can anyOf={[...]} />`. Cache uniquement l'UI ; **la sécurité est dans la RLS**.

## i18n

V1 : 1 locale (`fr-FR`). Strings dans `shared/i18n/fr.json`, accès via helper `t('namespace.key')`.

## Mobile / formateurs peu techniques

Espace formateur = **PWA installable**. Layout dédié `(formateur)/`, gros boutons, pas de sidebar. Émargement = QR code projeté, signature canvas mobile.
