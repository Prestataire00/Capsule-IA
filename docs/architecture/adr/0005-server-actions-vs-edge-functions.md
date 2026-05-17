# ADR 0005 — Server Actions actées pour V1, Edge Functions reportées V2

**Date** : 2026-05-16
**Statut** : Accepté
**Supplante (partiellement)** : [ADR 0003](./0003-auth-hook-pl-pgsql.md) (reste valide) et la section "Edge Functions" de [`docs/architecture/07-edge-functions.md`](../07-edge-functions.md) (à mettre à jour)

## Contexte

Le document `docs/architecture/07-edge-functions.md` et l'architecture BMAD V1 (`docs/architecture-i-a-infinity-of-2026-05-16.md`) décrivent un usage des Supabase Edge Functions Deno pour :

- **Atomicité multi-tables + outbox** → en fait fait via RPCs SQL (`app.save_dossier` 0024, etc.), pas Edge Fn. OK.
- **Effets de bord** : génération de documents (DOCX/PDF), envoi d'emails, signature, intégrations Zoom/Stripe.
- **Tâches asynchrones** : dispatcher d'events outbox, crons Qualiopi/attendance/cleanup.

**Audit du code (2026-05-16) confirme :** le dossier `supabase/functions/` est **vide**. Toutes ces fonctionnalités sont implémentées en **Server Actions Next.js** dans `apps/web/app/**/actions.ts` ou `apps/web/features/*/ui/actions.ts`.

C'est un **drift architectural** qui n'a pas été acté formellement. À ce stade (~70% V1 livré en Server Actions), un refactor complet vers Edge Functions coûterait ~30-40 SP et retarderait le pilote V1 de 2 sprints sans bénéfice fonctionnel direct.

## Décision

**Acter le choix Server Actions pour V1.** Les Edge Functions Deno sont **reportées V2**, avec migration progressive sur les workloads où le bénéfice est concret (scale-to-zero, isolation `service_role`, exécution périodique cron).

### Périmètre V1 Server Actions

Toutes les fonctionnalités suivantes restent en Server Actions Next.js :

| Workload | Implémentation actuelle (Server Action) | Doit migrer V2 ? |
|---|---|---|
| Signature document (apprenant token) | `apps/web/app/(apprenant)/signer/[token]/actions.ts` (via RPC `record_attendance_signature` + `get_signature_context`) | À évaluer (isolation `service_role`) |
| Génération DOCX | Server Action `documents/actions.ts` (à confirmer lib utilisée) | Peut migrer si lib lourde / runtime Edge plus adapté |
| Envoi email Resend | `shared/notification/resend.ts` appelé depuis Server Actions | Non (latence négligeable, OK Next.js) |
| Création meeting Zoom | Server Action `sessions/actions.ts` (config Zoom chiffrée pgsodium 0032) | Non sauf si scale-to-zero requis |
| Réponse questionnaire (apprenant token) | Server Action `(apprenant)/questionnaire/[token]/actions.ts` | À évaluer |
| Soumission réclamation apprenant | RPC `submit_learner_complaint` 0012 + Server Action wrapper | OK rester |
| Dispatcher outbox `infra.domain_events` | **PAS IMPLÉMENTÉ** — voir Risques | **À implémenter V1** (Edge Fn ou cron Server Action ?) |
| Cron preuves manquantes Qualiopi | **PAS IMPLÉMENTÉ** | Idem |
| Cron expiration questionnaires | **PAS IMPLÉMENTÉ** | Idem |
| Cron cleanup nightly | **PAS IMPLÉMENTÉ** | Idem |

### Garde-fous V1 obligatoires (à appliquer Sprint A)

Pour rendre l'usage `service_role` en Server Actions aussi sûr qu'en Edge Function isolée :

1. **Wrapper `serviceRoleAction({ guard, run })`** dans `shared/lib/safe-action.ts` qui :
   - Force la présence d'un `guard` explicite (vérification origine, JWT user valide, role check)
   - Loggue chaque appel dans `audit.audit_log` avec actor + IP + payload (sans secrets)
   - Centralise la création du client `service_role` (jamais en direct dans le code feature)
2. **Lint custom** interdit l'import direct de `createClient` avec service role en dehors de `shared/lib/`
3. **Validation Zod stricte** des inputs sur 100% des Server Actions `serviceRole` (déjà la convention via `next-safe-action`)
4. **Rate limit IP** sur les Server Actions publiques (signature, questionnaire, prospect inscription) — via Upstash Redis ou table `infra.rate_limit_buckets` dédiée
5. **Audit RLS** : tester pgTAP que les opérations en service_role ne contournent pas les invariants tenant (cf. Sprint A tests pgTAP massifs)

### Workloads asynchrones (dispatcher outbox + crons) — décision parallèle

**Problème majeur découvert** : aucun dispatcher n'existe pour `infra.domain_events`. Les events s'accumulent sans handler.

Options V1 :
- **(a) Mini-dispatcher en Server Action + pg_cron** : Server Action `/api/cron/dispatch-events` protégée par header `CRON_SECRET`, déclenchée par pg_cron toutes les 1 min via `net.http_post`. Simple, pas d'Edge Fn.
- **(b) Edge Function Deno `dispatch-events`** : implémentation conforme à l'archi initiale (1 seule Edge Fn pour V1). Plus propre archi mais ouvre la voie au "il en faut 5 autres".

**Choix V1 : option (a)** — mini-dispatcher Server Action + pg_cron `net.http_post`. Coût ~3 SP. Si limites de timeout / perf à V2, migration vers Edge Fn (option b) prévue.

## Conséquences

**Positives** :
- **~30 SP économisés** vs refacto complet Edge Functions
- **Cohérence** : un dev solo n'a pas à jongler entre Deno (Edge Fn) et Next.js (Server Actions)
- **DX** : type-safety bout-en-bout via `next-safe-action`, debug facile (Sentry Next.js)
- **Coût infra** : pas d'invocations Edge Fn comptabilisées (Supabase facture les Edge Fn calls au-delà du free tier)

**Négatives (acceptées pour V1)** :
- **Couplage workload async ↔ instance Next.js** : si Railway down, dispatcher down. Mitigation : healthcheck + redémarrage auto Railway.
- **Pas de scale-to-zero** : Server Action toujours sur Railway (coût constant, mais déjà budgété).
- **`service_role` plus exposé** : mitigé par les 5 garde-fous ci-dessus.
- **Documentation `07-edge-functions.md` obsolète** : à marquer "vision V2", section "RPC SQL" reste valide.

## Alternatives écartées

- **Refacto complet Edge Functions V1** : 30-40 SP, retarde pilote 2 sprints, gain marginal vu l'état actuel
- **Refacto progressif (dispatcher + sign-document d'abord)** : 20 SP, retarde pilote 1 sprint, complexifie le mental model dev solo
- **Inngest / BullMQ / Trigger.dev** pour async : dépendance supplémentaire, coût mensuel, hors stack Supabase

## Trigger de réévaluation V2

Réévaluer la migration vers Edge Functions si **l'une** des conditions suivantes se réalise :

- Dispatcher Server Action saturé (latence dispatch > 2 min sur events `must_deliver`)
- Coût Railway dépasse 50 $/mois (workloads async = dominant)
- Besoin de scale-to-zero pour réduire coûts hors heures
- Edge Fn nouvelles features Supabase non disponibles en Server Action (e.g. streaming long-running)
- Audit sécurité externe pointe les usages `service_role` comme risque
- Volume > 10 OF actifs (V2 commercial)

**Priorité V2 si déclenchement :** dispatcher outbox → sign-document → generate-document → crons.
