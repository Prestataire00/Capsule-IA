# Security audit on a feature

## Context
Feature/route: [TARGET]
Concern: [what worries you, or "general"]

## Checklist
1. **RLS coverage** :
   - Liste toutes les tables touchées par cette feature.
   - Pour chacune : RLS enabled + forced ? Policy par opération ? pgTAP test existe ?
2. **Server Action** :
   - Wrappée dans `requireRoles(...)` ?
   - Inputs validés par Zod ?
   - Retourne erreur mappée, jamais une exception brute ?
3. **Edge Function** (si applicable) :
   - Auth header validé (CRON_SECRET ou JWT scope) ?
   - Idempotente via `processed_events` ?
   - service_role utilisé avec guard explicite en début de fonction ?
4. **Token-based access** (signatures, questionnaires) :
   - JWT signé avec `TOKEN_SIGNING_KEY` ?
   - `jti` enforced single-use via `processed_events` ?
   - Expiration vérifiée ?
5. **Storage** :
   - Tous les paths privés ; signed URLs uniquement ?
   - TTL ≤ 15 minutes pour les downloads ?
6. **Audit** :
   - Table sensible dans la liste audit du trigger ?
   - `audit.audit_log` policies préviennent UPDATE/DELETE ?
7. **Cross-tenant** :
   - `rls_cross_tenant.sql` couvre les tables de cette feature ?
8. **PII / RGPD** :
   - Hook anonymisation en place si données apprenant ?
   - Logs n'imprime pas de PII (email, nom, IP) ?

## Output
- Findings with severity (CRITICAL / MAJOR / MINOR / INFO)
- Concrete fix per finding
- Updated tests
