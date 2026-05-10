# Add an RLS policy

## Context
Table: `app.[TABLE]`
Operation: `[SELECT|INSERT|UPDATE|DELETE]`
Roles allowed: `[LIST]` (subset of: owner, admin, gestionnaire, comptable, formateur)
Special filter: `[e.g. only assigned trainers, only own drafts, etc.]`

## What to do
1. Open `supabase/migrations/00XX_rls_[CONTEXT].sql` (next sequence).
2. ONE policy per operation. Never `FOR ALL`.
3. Use helpers from `0018_rls_helpers.sql`. NEVER inline JWT lookups.
4. Both `USING` and `WITH CHECK` for UPDATE.
5. Confirm `ENABLE/FORCE ROW LEVEL SECURITY` already set.
6. Add a pgTAP test in `supabase/tests/rls_[CONTEXT].sql`:
   - allowed role on own org
   - cross-tenant denial
   - forbidden role refused
   - service_role bypass
7. Update the cross-tenant test list in `rls_cross_tenant.sql`.

## Constraints
- DO NOT use `auth.jwt()` directly when a helper exists.
- DO NOT add DELETE policies on business tables unless asked. Use soft-delete via UPDATE.

## Output
- Migration file diff
- pgTAP test file diff
- `pnpm db:reset && pnpm db:test` passes
