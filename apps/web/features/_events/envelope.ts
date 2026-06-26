import { z } from 'zod';

export const baseEnvelopeShape = {
  eventId: z.string().uuid(),
  organizationId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  correlationId: z.string().uuid().nullable(),
  causationId: z.string().uuid().nullable(),
  occurredAt: z.coerce.date(),
  version: z.number().int().positive(),
} as const;

export const defineEvent = <
  TType extends string,
  TAgg extends string,
  TShape extends z.ZodRawShape,
>(args: {
  type: TType;
  aggregateType: TAgg;
  payload: TShape;
}) => {
  const schema = z.object({
    ...baseEnvelopeShape,
    type: z.literal(args.type),
    aggregateType: z.literal(args.aggregateType),
    payload: z.object(args.payload),
  });
  return Object.freeze({
    type: args.type,
    aggregateType: args.aggregateType,
    schema,
  });
};

export type EventDefinition = ReturnType<typeof defineEvent>;
export type EventOf<D extends EventDefinition> = z.infer<D['schema']>;

// ─── Helpers Zod réutilisables ────────────────────────────────────
export const z_uuid = z.string().uuid();
export const z_isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const z_isoDatetime = z.string().datetime({ offset: true });
export const z_currency = z.enum(['EUR', 'USD', 'CHF', 'GBP']);
export const z_modality = z.enum(['presentiel', 'distanciel', 'hybride']);
export const z_dossierStatus = z.enum([
  'draft', 'pending_validation', 'scheduled', 'active',
  'completed', 'closed', 'archived', 'cancelled',
]);
export const z_money = z.object({
  cents: z.number().int().nonnegative(),
  currency: z_currency,
});
