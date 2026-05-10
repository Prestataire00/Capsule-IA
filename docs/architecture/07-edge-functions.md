# 07 — Edge Functions

**Source de vérité : `supabase/functions/` + RPC SQL `supabase/migrations/0024_rpc_save_dossier.sql`.**

## Rôles

Les Edge Functions sont les *seuls endroits* où le `service_role` est utilisé. 3 rôles :

1. **Atomicité** — quand une opération doit englober plusieurs tables + l'outbox dans une seule TX → RPC SQL (`save_dossier`).
2. **Effets de bord** — génération de documents, envoi d'emails, signature, intégrations Zoom/Stripe.
3. **Tâches asynchrones** — dispatcher d'events, crons (Qualiopi, attendance, dead letter).

## 4 règles dures

- **Idempotence** par `(event_id, handler_name)` ou `(operation_id)`.
- **Validation Zod** stricte des inputs (events, payloads HTTP, tokens).
- **Logs structurés** avec `correlation_id` propagé depuis l'event d'origine.
- **Backoff exponentiel** + `next_retry_at` + dead letter après 8 tentatives.

## Edge Functions livrées (squelettes à compléter)

| Fonction | Trigger | Rôle |
|---|---|---|
| `dispatch-events` | pg_cron 1 min | Vide l'outbox, route vers handlers |
| `generate-document` | HTTP (Server Action ou handler) | DOCX via docxtemplater + PizZip + hash + Storage |
| `sign-document` | HTTP (apprenant token) | Capture signature, hash document, audit |
| `compute-qualiopi-readiness` | pg_cron nightly | Recalcule `qualiopi_dossier_checklists` |
| `detect-missing-attendance` | pg_cron daily 9h | Émet `attendance.missing.detected` |
| `expire-questionnaires` | pg_cron 6h | Marque expired, émet event |
| `nightly-cleanup` | pg_cron 3h | Purge Storage `/exports/`, refresh KPIs |

## RPCs SQL (livrées)

- **`save_dossier(p_dossier jsonb, p_events jsonb[])`** — atomicité agrégat + outbox. `SECURITY DEFINER` avec guard `organization_id = app.current_organization_id()`.
- **`claim_events_for_dispatch(p_batch int)`** — `FOR UPDATE SKIP LOCKED` pour le dispatcher.

## Secrets requis

```bash
supabase secrets set CRON_SECRET=$(openssl rand -base64 32)
supabase secrets set TOKEN_SIGNING_KEY=$(openssl rand -base64 32)
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set ZOOM_API_KEY=...
supabase secrets set ZOOM_API_SECRET=...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

## Pièges

1. **`SECURITY DEFINER` sans `search_path`** → vuln d'escalation possible. Toujours `SET search_path = pg_catalog, app, infra`.
2. **Edge Fn sans timeout-aware** → Supabase coupe à 150s. Paginer les boucles cron.
3. **Idempotence mal posée** → side-effects non-idempotents (mail, Stripe charge) doivent avoir leur propre clé de déduplication côté provider.
4. **service_role key dans logs** → bannir tout dump `req.headers`.
