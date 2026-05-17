# ADR 0003 — Auth Hook PL/pgSQL pour custom JWT claims

**Date** : 2026-05-16
**Statut** : Accepté

## Contexte

L'architecture multi-tenant repose entièrement sur RLS Postgres via les helpers `app.current_organization_id()`, `app.current_role()`, `app.current_member_id()` (cf. [05-rls-policies.md](../05-rls-policies.md)). Ces helpers lisent des **custom claims** dans le JWT Supabase : `organization_id`, `role`, `member_id`.

**Sans ces claims, toutes les policies RLS cassent** : aucune requête ne sait à quel tenant elle appartient → soit accès refusé partout, soit fuite cross-tenant si on bypasse. C'est un single point of failure absolu de l'architecture sécu.

Supabase Auth émet par défaut un JWT générique (`sub`, `email`, `aud`, `role: 'authenticated'`) sans nos claims métier. Il faut un **Auth Hook** qui les injecte à chaque émission/refresh du token.

Supabase propose deux modes pour les Auth Hooks :
- **Database Function (PL/pgSQL)** : fonction Postgres appelée en interne par GoTrue, intra-process
- **HTTP Hook (Edge Function ou endpoint externe)** : appel HTTP sortant à chaque émission de token

Cas multi-org (FR-005 — un user peut appartenir à plusieurs OF) : l'org "active" doit être stockée quelque part de durable et lue par le hook au moment de l'émission.

## Décision

**Database Function PL/pgSQL `app.before_token_emit(event jsonb) RETURNS jsonb`** déclarée comme Auth Hook Supabase (mode `before-token-emit`).

La fonction :
1. Lit `event->>'user_id'`
2. Lit `members.is_default_org (avec fallback membership la plus ancienne)` du user (colonne dédiée, mise à jour par la Server Action `switchOrganizationAction` lors d'un changement d'org)
3. Lit `members(user_id, organization_id)` pour récupérer `role` et `member_id` correspondants
4. Retourne `event` enrichi avec :
   ```jsonb
   {
     "claims": {
       ...existing claims...,
       "app_metadata": {
         "organization_id": "<uuid>",
         "role": "<owner|admin|gestionnaire|formateur|comptable>",
         "member_id": "<uuid>"
       }
     }
   }
   ```

Les helpers RLS lisent ensuite ces claims via `auth.jwt() -> 'app_metadata' ->> 'organization_id'`.

Pour multi-org : `switchOrganizationAction` fait `UPDATE profiles SET active_organization_id = $1 WHERE id = auth.uid()` puis force un **refresh JWT** côté client (`supabase.auth.refreshSession()`) qui re-déclenche le hook avec la nouvelle org active.

## Conséquences

**Positives** :
- **Latence quasi nulle** (appel intra-Postgres, pas de HTTP)
- **Atomicité** : pas de fenêtre où le JWT pourrait être émis sans claims (échec hook = échec émission, transactionnel)
- **Pas de service externe à maintenir** pour ce besoin (pas d'Edge Function dédiée)
- **Test pgTAP natif** possible : forcer émission JWT en SQL et asserter les claims du retour
- Code centralisé en SQL **à côté** des helpers RLS qui le consomment (cohérence)
- Pas de dépendance réseau supplémentaire au critical path login/refresh

**Négatives** :
- **PL/pgSQL est verbeux et moche à débugger** comparé à TypeScript
- **Logique métier en SQL** (sépare des features TS) — mais c'est ~30 lignes, périmètre contenu et stable
- **Migration cassée du hook = login down** : tests pgTAP en CI obligatoires avant chaque déploiement de la fonction. Pas de rollback automatique → ajouter une procédure manuelle dans le runbook deployment

## Alternatives écartées

- **HTTP Hook (Edge Function Deno)** : +30-100 ms latence à chaque émission/refresh JWT (fréquence élevée), code TS familier mais latence pas justifiée à notre échelle, et risque de timeout réseau au pire moment.
- **Pas de claims, lookup `members` à chaque requête** : surcharge énorme (1 query supplémentaire à chaque appel API), perd l'avantage stateless du JWT, RLS deviendrait dépendante d'une query custom pas auditée.
- **Stocker `organization_id` dans cookie séparé** : sécurité bancale (cookie modifiable côté client en l'absence de signature), désynchronisation possible avec JWT, mauvais pattern.
- **Émettre 1 JWT par org du user** : ingérable côté client si multi-org, complique le RLS (lequel utiliser ?).

## Trigger de réévaluation

- Si Supabase propose un mécanisme natif multi-org plus propre (improbable à court terme)
- Si le hook devient trop complexe (> 100 lignes PL/pgSQL ou logique conditionnelle imbriquée) → migrer vers HTTP Hook Deno pour la lisibilité
- Si la latence du switch multi-org devient problème UX (refresh JWT visible à l'utilisateur) → optimiser via cache court côté client ou pré-fetch
- Si Supabase introduit un Auth Hook mode "synchronous database trigger" plus performant → migrer
