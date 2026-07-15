'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';

const ANCHORS = ['first_session_start', 'dossier_start', 'dossier_end'] as const;
const RECIPIENT_KINDS = ['learner', 'trainer'] as const;

const ruleFields = {
  name: z.string().trim().min(1, 'Nom requis.').max(120),
  anchor: z.enum(ANCHORS),
  offsetDays: z.number().int().min(-365).max(365),
  recipientKind: z.enum(RECIPIENT_KINDS),
  subject: z.string().trim().min(1, 'Objet requis.').max(300),
  body: z.string().trim().min(1, 'Corps requis.').max(5000),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function currentOrgId(sb: any): Promise<string | null> {
  const { data } = await sb.schema('app').from('organizations').select('id').limit(1).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export const createSchedule = authActionClient
  .schema(z.object(ruleFields))
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await currentOrgId(ctx.supabase);
    if (!orgId) return { ok: false as const, error: 'no_org' };

    const { error } = await ctx.supabase
      .schema('app')
      .from('email_schedules' as never)
      .insert({
        organization_id: orgId,
        name: parsedInput.name,
        anchor: parsedInput.anchor,
        offset_days: parsedInput.offsetDays,
        recipient_kind: parsedInput.recipientKind,
        subject: parsedInput.subject,
        body: parsedInput.body,
        enabled: true,
      } as never);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath('/programmation');
    return { ok: true as const };
  });

export const updateSchedule = authActionClient
  .schema(z.object({ id: z.string().uuid(), ...ruleFields }))
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('email_schedules' as never)
      .update({
        name: parsedInput.name,
        anchor: parsedInput.anchor,
        offset_days: parsedInput.offsetDays,
        recipient_kind: parsedInput.recipientKind,
        subject: parsedInput.subject,
        body: parsedInput.body,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', parsedInput.id);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath('/programmation');
    return { ok: true as const };
  });

export const toggleSchedule = authActionClient
  .schema(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('email_schedules' as never)
      .update({ enabled: parsedInput.enabled, updated_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.id);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath('/programmation');
    return { ok: true as const };
  });

export const deleteSchedule = authActionClient
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const { error } = await ctx.supabase
      .schema('app')
      .from('email_schedules' as never)
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.id);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath('/programmation');
    return { ok: true as const };
  });
