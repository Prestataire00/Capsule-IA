# 04 — Catalogue d'events Zod

**Source de vérité : `apps/web/features/_events/`.**

## Principes

- **Naming** : `<context>.<aggregate>.<verb-past-tense>` en kebab-case.
- **Versioning** : champ `version` (entier ≥ 1). Ajout de champ optionnel = pas de bump. Champ obligatoire ou changement de sémantique = nouveau type d'event ou bump version.
- **Producteur unique, consommateurs multiples**. Si tu te retrouves à émettre le même type depuis deux endroits → réfléchis à 2x.
- **Idempotence côté handlers** via `infra.processed_events(event_id, handler_name)` UNIQUE.
- **Criticalité** : `must_deliver` (Qualiopi, comptable, signature) vs `best_effort` (notif cosmétique).

## Enveloppe canonique

```ts
{
  eventId: UUID,
  type: '<context>.<aggregate>.<verb>',
  aggregateType: 'dossier' | 'document' | ...,
  aggregateId: UUID,
  organizationId: UUID,
  actorUserId: UUID | null,
  correlationId: UUID | null,
  causationId: UUID | null,
  occurredAt: Date,
  version: 1,
  payload: { ... }
}
```

Le helper `defineEvent({ type, aggregateType, payload })` factorise tout.

## Fichiers

```
apps/web/features/_events/
├── envelope.ts                ← defineEvent + helpers Zod
├── registry.ts                ← allEventDefs + parseDomainEvent + schemaByType
├── identity.events.ts         (4 events)
├── crm.events.ts              (4)
├── catalog.events.ts          (3)
├── dossier.events.ts          (15)
├── scheduling.events.ts       (4)
├── attendance.events.ts       (4)
├── documents.events.ts        (8 dont signatures)
├── qualiopi.events.ts         (3)
├── questionnaire.events.ts    (3)
├── complaint.events.ts        (3)
├── billing.events.ts          (4)
└── automation.events.ts       (2)
```

**Total : 57 events V1.**

## Comment ajouter un event

1. Ajoute la définition Zod dans `_events/<context>.events.ts` via `defineEvent({...})`.
2. Ajoute la classe TS miroir dans `features/<context>/domain/<aggregate>.events.ts`.
3. Enregistre dans `_events/registry.ts` (append à `allEventDefs`).
4. Si producteur existe : `recordEvent` dans le use case.
5. Si consommateurs : crée handler dans `supabase/functions/dispatch-events/handlers/`.

Voir `docs/prompts/add-event.md`.
