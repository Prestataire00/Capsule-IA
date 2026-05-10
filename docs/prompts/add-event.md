# Add a new domain event

## Context
Add a new event in the `[CONTEXT]` bounded context.

## Inputs
- Event type: `[CONTEXT].[AGGREGATE].[VERB-PAST-TENSE]` (e.g. `dossier.module-locked`)
- Aggregate: `[AGGREGATE]`
- Trigger: when [WHEN]
- Payload fields: [LIST + Zod-style types]
- Producer: `[CONTEXT]/application/commands/[USE-CASE]`
- Consumers: [LIST or "none yet"]
- Criticality: `[must_deliver | best_effort]`

## What to do
1. Add the Zod schema in `apps/web/features/_events/[CONTEXT].events.ts` using `defineEvent({...})`.
2. Add the event interface in `features/[CONTEXT]/domain/[AGGREGATE].events.ts`.
3. Register in `apps/web/features/_events/registry.ts` (append to `allEventDefs`).
4. If a producer use case exists, ensure `recordEvent` is called.
5. If consumers are listed, create handlers in `supabase/functions/dispatch-events/handlers/` and register.

## Constraints
- DO NOT bump version yet — V1.
- DO NOT introduce a new aggregate type unless explicitly listed.
- Preserve naming convention: kebab-case, past tense.

## Output
- File diffs (events file, registry, handlers).
- Reachable via `parseDomainEvent({ type: '...', ... })` in tests.
