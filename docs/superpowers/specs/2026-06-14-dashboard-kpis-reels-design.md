# Dashboard KPIs réels (Qualiopi + commerciaux) — Design

> Statut : validé en brainstorming, prêt pour plan.
> Date : 2026-06-14 · Contexte borné : `reports`/`dossier` (lecture).

## 1. Problème

La page d'accueil `(dashboard)/page.tsx` affiche des **KPIs en dur** (mock `@/shared/mock/data`,
ex. « Taux de complétion 87% », « 128 dossiers actifs »). Le backend KPIs existe
(`reports.mv_org_kpis`) mais **n'est jamais rafraîchi** (aucun `REFRESH`/pg_cron) → le lire
donnerait des chiffres figés. Besoin : des **KPIs Qualiopi + commerciaux réels et frais**.

## 2. Constat d'audit

- `reports.mv_org_kpis` (vue **matérialisée**, jamais rafraîchie) calcule : `dossiers_active`,
  `dossiers_closed_this_month`, `dossiers_qualiopi_blocking` (`qualiopi_ready=false` & status
  active/completed), `revenue_in_progress_cents`, `nps_avg`.
- Home dashboard = **mock** ; structure : 4 StatCards + zone « à traiter » (docs à signer,
  émargements manquants, questionnaires) + chart financeur + table dossiers + carte Qualiopi.
- Tables sources réelles : `app.dossiers` (status, qualiopi_ready, total_amount_cents,
  closed_at), `app.document_signatures` (status), `app.attendance_consolidated` (vue déjà créée :
  `signed_count`/`expected_count`/`status`), `app.questionnaire_responses` (status).
- Facturation & questionnaires V1 : déjà en place (hors périmètre ici).

## 3. Décisions (brainstorming)

| Décision | Choix |
|---|---|
| Source KPIs | **Vue live** `app.v_org_kpis` `SECURITY INVOKER` (pas la mv figée) — Approche A |
| Périmètre | **KPIs en-tête + compteurs « à traiter »** en réel ; reste de la home mock (de-mock incrémental) |
| Taux Qualiopi | `(active_completed − blocking) / active_completed`, calculé en TS (gère /0) |

### Hors périmètre (YAGNI)
- Chart répartition financeur, table dossiers, carte Qualiopi détaillée → restent mock (V1).
- Pas de rafraîchissement de `mv_org_kpis` (on la contourne par une vue live).
- Pas de nouvelle page : on branche la home existante.

## 4. Architecture & flux

```
app.dossiers ──► VUE app.v_org_kpis (SECURITY INVOKER, live, RLS héritée)
                       │  (dossiers_active, closed_this_month, qualiopi_blocking,
                       │   active_completed, revenue_in_progress_cents, nps_avg)
                       ▼
   query TS  features/reports/org-kpis.query.ts  ──(+ 3 count "à traiter")──►
                       │  qualiopiCompletionRate() (pur)
                       ▼
   (dashboard)/page.tsx : StatCards + "à traiter" en réel (reste mock inchangé)
```

## 5. Composant — Migration : vue live `app.v_org_kpis`

```sql
CREATE VIEW app.v_org_kpis WITH (security_invoker = true) AS
SELECT
  d.organization_id,
  COUNT(*) FILTER (WHERE d.status = 'active')                                  AS dossiers_active,
  COUNT(*) FILTER (WHERE d.status = 'closed'
                     AND d.closed_at >= date_trunc('month', now()))           AS dossiers_closed_this_month,
  COUNT(*) FILTER (WHERE d.qualiopi_ready = false
                     AND d.status IN ('active','completed'))                   AS dossiers_qualiopi_blocking,
  COUNT(*) FILTER (WHERE d.status IN ('active','completed'))                   AS dossiers_active_completed,
  SUM(d.total_amount_cents) FILTER (WHERE d.status IN ('active','completed','closed')) AS revenue_in_progress_cents,
  AVG(qr.nps) AS nps_avg
FROM app.dossiers d
LEFT JOIN app.questionnaire_responses qr ON qr.dossier_id = d.id AND qr.nps IS NOT NULL
WHERE d.deleted_at IS NULL
GROUP BY d.organization_id;

GRANT SELECT ON app.v_org_kpis TO authenticated;
```
Numéro de migration : **élevé** (main ≈ 0066 après merges parallèles) — vérifier le prochain
libre au plan. RLS héritée (invoker). Vérifier au plan que `dossiers.qualiopi_ready` et
`questionnaire_responses.nps` existent toujours (sinon adapter).

## 6. Composant — Query + helper pur

`apps/web/features/reports/org-kpis.query.ts` :
- `qualiopiCompletionRate(activeCompleted: number, blocking: number): number` (pur, 0..1 ;
  `activeCompleted = 0 → 1` c.-à-d. 100 % « rien à bloquer »).
- `getOrgKpis(sb): Promise<OrgKpis>` — lit `v_org_kpis` (1 ligne) + 3 `count` RLS :
  - `toSign` = `document_signatures` `status='pending'`,
  - `attendanceMissing` = `attendance_consolidated` où `signed_count < expected_count` et `status <> 'finalized'`,
  - `questionnairesPending` = `questionnaire_responses` `status IN ('pending','in_progress')`.
- Sortie `OrgKpis = { dossiersActive, dossiersClosedThisMonth, qualiopiRate, revenueInProgressCents, npsAvg, toSign, attendanceMissing, questionnairesPending }`.

## 7. Composant — Branchement home

`(dashboard)/page.tsx` (Server Component) : appeler `getOrgKpis`, remplacer les **valeurs**
des StatCards (dossiers actifs, **taux Qualiopi réel**, CA en cours formaté €, NPS ou clôturés/
mois) et les compteurs « à traiter ». Le reste (chart, table, carte Qualiopi) **inchangé**.
Charte v3 conservée. Lecture via le client déjà utilisé par la home (vérifier au plan :
`supabaseServer` RLS vs service_role — préférer RLS pour des KPIs scopés org).

## 8. Tests
- **Vitest** : `qualiopiCompletionRate` (normal, /0 → 1, arrondi attendu).
- **pgTAP** : `v_org_kpis` n'expose que l'org du JWT (isolation cross-tenant).
- **Manuel** : la home affiche des nombres cohérents avec la base ; le taux Qualiopi varie (≠ « 87% » figé) ; les compteurs « à traiter » reflètent le réel.

## 9. Ordre de développement (CLAUDE.md)
1. Migration (vue `v_org_kpis`).
2. pgTAP (isolation).
3. `pnpm db:types` + helper pur `qualiopiCompletionRate` + tests Vitest.
4. Query `getOrgKpis`.
5. Branchement StatCards + « à traiter » dans la home.
6. Golden path manuel.

Additif, lecture seule, rayon minimal. Golden path : un OF ouvre l'accueil et voit ses vrais
chiffres Qualiopi (taux de conformité) et commerciaux (dossiers actifs, CA en cours) + ce qu'il
reste à traiter, au lieu de valeurs de démonstration.
