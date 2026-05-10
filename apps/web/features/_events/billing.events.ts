import { z } from 'zod';
import { defineEvent, z_uuid, z_isoDatetime, z_currency } from './envelope';

export const InvoiceIssued = defineEvent({
  type: 'billing.invoice.issued',
  aggregateType: 'invoice',
  payload: {
    reference: z.string().min(1),
    dossierId: z_uuid.nullable(),
    funderId: z_uuid.nullable(),
    companyId: z_uuid.nullable(),
    totalCents: z.number().int().nonnegative(),
    vatCents: z.number().int().nonnegative(),
    currency: z_currency,
    issuedAt: z_isoDatetime,
    dueAt: z_isoDatetime,
  },
});

export const InvoicePaid = defineEvent({
  type: 'billing.invoice.paid',
  aggregateType: 'invoice',
  payload: {
    paidAt: z_isoDatetime,
    method: z.enum(['virement', 'cheque', 'cb', 'stripe', 'autre']),
    amountCents: z.number().int().positive(),
  },
});

export const InvoiceOverdue = defineEvent({
  type: 'billing.invoice.overdue',
  aggregateType: 'invoice',
  payload: {
    dueAt: z_isoDatetime,
    daysOverdue: z.number().int().positive(),
    remindersSent: z.number().int().nonnegative(),
  },
});

export const InvoiceCancelled = defineEvent({
  type: 'billing.invoice.cancelled',
  aggregateType: 'invoice',
  payload: { reason: z.string().min(1) },
});
