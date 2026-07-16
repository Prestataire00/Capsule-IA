'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { loadSession } from '@/features/sessions/load-session';

const EXPENSE_KINDS = ['salaire_formateur', 'achat_formation', 'sous_traitance_confiee', 'autre'] as const;

export const addSessionExpense = authActionClient
  .schema(
    z.object({
      sessionId: z.string().uuid(),
      kind: z.enum(EXPENSE_KINDS),
      label: z.string().trim().min(1, 'Libellé requis.').max(200),
      amountEuros: z.number().min(0),
      supplierName: z.string().trim().max(200).optional(),
      hours: z.number().min(0).optional(),
      incurredOn: z.string().trim().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const loaded = await loadSession(ctx.supabase, parsedInput.sessionId);
    if (!loaded) return { ok: false as const, error: 'session_not_found' };
    if (!loaded.formation) return { ok: false as const, error: 'no_formation' };

    const { error } = await ctx.supabase
      .schema('app')
      .from('formation_expenses' as never)
      .insert({
        organization_id: loaded.session.organization_id,
        formation_id: loaded.formation.id,
        session_id: parsedInput.sessionId,
        kind: parsedInput.kind,
        label: parsedInput.label,
        amount_cents: Math.round(parsedInput.amountEuros * 100),
        hours: parsedInput.hours ?? null,
        supplier_name: parsedInput.supplierName || null,
        incurred_on: parsedInput.incurredOn || null,
      } as never);
    if (error) return { ok: false as const, error: error.message };

    revalidatePath(`/sessions/${parsedInput.sessionId}/depenses`);
    return { ok: true as const };
  });

export const deleteSessionExpense = authActionClient
  .schema(z.object({ sessionId: z.string().uuid(), id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('formation_expenses' as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.id);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath(`/sessions/${parsedInput.sessionId}/depenses`);
    return { ok: true as const };
  });
