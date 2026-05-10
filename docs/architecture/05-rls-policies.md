# 05 — RLS policies

**Source de vérité : `supabase/migrations/0018_rls_helpers.sql` à `0023_rls_*.sql`.**

## 4 principes durs

1. **Toute policy lit `organization_id` du JWT, jamais d'un input client.**
2. **Pas de `FOR ALL`.** Une policy par opération (SELECT, INSERT, UPDATE, DELETE).
3. **Pas de DELETE direct depuis le client** sur les tables métier. Soft delete via UPDATE `deleted_at`.
4. **Les apprenants n'ont pas de RLS.** Pas de compte (V1). Accès via tokens JWT validés par Edge Functions qui écrivent en `service_role`.

## Helpers (migration `0018`)

```sql
app.current_organization_id()    -- du JWT
app.current_role()
app.current_member_id()
app.is_org_member(org)
app.has_role(VARIADIC roles)
app.is_admin_or_owner()
app.is_staff()                   -- owner | admin | gestionnaire
app.is_dossier_trainer(dossier_id)
```

## Pattern canonique

```sql
ALTER TABLE app.X ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.X FORCE ROW LEVEL SECURITY;

CREATE POLICY x_select ON app.X FOR SELECT USING (
  organization_id = app.current_organization_id()
  AND deleted_at IS NULL
);

CREATE POLICY x_insert ON app.X FOR INSERT WITH CHECK (
  organization_id = app.current_organization_id()
  AND app.is_staff()
);

CREATE POLICY x_update ON app.X FOR UPDATE
USING (organization_id = app.current_organization_id() AND app.is_staff())
WITH CHECK (organization_id = app.current_organization_id() AND app.is_staff());
```

## Découpage en migrations

| Migration | Couvre |
|---|---|
| `0019` | Identity (org, profile, members, invitations) + CRM + Catalog + Trainers/Funders |
| `0020` | Dossier (l'agrégat racine — le plus sensible) |
| `0021` | Scheduling, Attendance, Documents |
| `0022` | Qualiopi, Questionnaires, Complaints |
| `0023` | Billing, Notifications, Feature flags, Audit |

Tables `infra.*` : aucune policy → invisibles côté client (accessibles uniquement en `service_role`).

## Tests pgTAP

Helper dans `supabase/tests/_helpers.sql` :

```sql
SELECT tests.set_jwt('<org>', '<role>', '<user_id>');
SELECT tests.as_authenticated();
SELECT tests.as_service_role();
```

Le test critique à écrire : **`rls_cross_tenant.sql`** qui boucle sur toutes les tables avec `organization_id` et vérifie qu'aucune ne fuite cross-tenant.

## Pièges classiques

1. **`USING` vs `WITH CHECK`** : sur UPDATE, mettre les deux. Sinon contournement possible.
2. **Subquery dans policy = perf** : `app.is_dossier_trainer()` est `STABLE`, OK pour les petits volumes. Garder un index sur `dossier_trainers(dossier_id, trainer_id)`.
3. **`auth.uid()` NULL en cron** : les triggers d'audit le tolèrent.
4. **`FORCE` toujours**, sinon le propriétaire de la table bypasse RLS.
5. **JWT custom claims** (`organization_id`, `role`, `member_id`) doivent être posés par un Auth Hook Supabase post-token. Sans lui, **toutes les policies cassent**.
