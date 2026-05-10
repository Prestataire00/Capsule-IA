# Add a new use case to an existing aggregate

## Context
Aggregate: `[AGGREGATE]` (e.g. `Dossier`)
Use case name: `[NAME]` (e.g. `assignTrainerToDossier`)
Inputs: [LIST]
Invariants to enforce:
- [INVARIANT 1]
- [INVARIANT 2]
Event(s) emitted: [LIST or "none"]

## What to do
1. **Test FIRST** in `features/[CONTEXT]/domain/__tests__/[AGGREGATE].entity.spec.ts`:
   - Happy path
   - Each invariant violation
   - Idempotence if applicable
2. Add the method on the aggregate in `features/[CONTEXT]/domain/[AGGREGATE].entity.ts`:
   - Returns `Result<void, [CONTEXT]Error>`
   - Calls `this.recordEvent({...})` for each event
3. Add error code(s) to `features/[CONTEXT]/domain/[AGGREGATE].errors.ts` if needed.
4. Add command file in `features/[CONTEXT]/application/commands/[NAME].ts`:
   - Curried `(deps) => async (input) => Result<...>`
5. Add Zod schema to `features/[CONTEXT]/ui/schemas.ts`.
6. Add Server Action to `features/[CONTEXT]/ui/actions.ts` using `requireRoles([...])` and the right `revalidateTag`.

## Constraints
- DO NOT skip the test step.
- DO NOT throw exceptions for expected business errors. Return `Result.err({...})`.
- DO NOT touch infrastructure (repo or Supabase) from the domain.
- The aggregate stays pure — no `Date.now()`, use injected `now()` and `newEventId()`.

## Output
- Domain method + tests passing
- Command + Server Action ready to be called from UI
