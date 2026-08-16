'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/env.mjs';
import { guardRowAction } from '@/shared/lib/auth/guard-action';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const replySchema = z.object({
  complaintId: z.string().uuid(),
  message: z.string().trim().min(2).max(5000),
  byName: z.string().trim().min(1).max(200),
});

const statusSchema = z.object({
  complaintId: z.string().uuid(),
  newStatus: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  byName: z.string().trim().min(1).max(200),
  resolution: z.string().trim().max(2000).optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getOrgId(complaintId: string): Promise<string | null> {
  const sb = admin();
  const { data } = await sb
    .schema('app')
    .from('complaints')
    .select('organization_id')
    .eq('id', complaintId)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

export async function replyToComplaint(input: z.infer<typeof replySchema>): Promise<ActionResult> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const guard = await guardRowAction('complaints', parsed.data.complaintId, 'qualiopi');
  if (!guard.ok) return { ok: false, error: guard.error };

  const orgId = await getOrgId(parsed.data.complaintId);
  if (!orgId) return { ok: false, error: 'complaint_not_found' };

  const sb = admin();
  const { error: insertErr } = await sb.schema('app').from('complaint_events').insert({
    organization_id: orgId,
    complaint_id: parsed.data.complaintId,
    kind: 'comment',
    payload: {
      by: parsed.data.byName,
      text: parsed.data.message,
      from_learner: false,
    },
  });
  if (insertErr) return { ok: false, error: 'insert_failed' };

  // Si la réclamation est encore "open", on bascule en "in_progress" au premier reply
  const { data: cRow } = await sb
    .schema('app')
    .from('complaints')
    .select('status')
    .eq('id', parsed.data.complaintId)
    .maybeSingle();
  if ((cRow as { status: string } | null)?.status === 'open') {
    await sb.schema('app').from('complaints').update({ status: 'in_progress' }).eq('id', parsed.data.complaintId);
    await sb.schema('app').from('complaint_events').insert({
      organization_id: orgId,
      complaint_id: parsed.data.complaintId,
      kind: 'status_change',
      payload: { by: parsed.data.byName, from: 'open', to: 'in_progress', text: 'Statut → En cours de traitement' },
    });
  }

  revalidatePath(`/reclamations/${parsed.data.complaintId}`);
  return { ok: true };
}

export async function changeComplaintStatus(input: z.infer<typeof statusSchema>): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const guard = await guardRowAction('complaints', parsed.data.complaintId, 'qualiopi');
  if (!guard.ok) return { ok: false, error: guard.error };

  const orgId = await getOrgId(parsed.data.complaintId);
  if (!orgId) return { ok: false, error: 'complaint_not_found' };

  const sb = admin();
  const update: Record<string, unknown> = { status: parsed.data.newStatus };
  if (parsed.data.newStatus === 'resolved') {
    update.resolved_at = new Date().toISOString();
    if (parsed.data.resolution) update.resolution = parsed.data.resolution;
  }
  if (parsed.data.newStatus === 'closed') {
    update.closed_at = new Date().toISOString();
  }

  const { error: updErr } = await sb
    .schema('app')
    .from('complaints')
    .update(update)
    .eq('id', parsed.data.complaintId);
  if (updErr) return { ok: false, error: 'update_failed' };

  const kind = parsed.data.newStatus === 'resolved' ? 'resolution' : 'status_change';
  await sb.schema('app').from('complaint_events').insert({
    organization_id: orgId,
    complaint_id: parsed.data.complaintId,
    kind,
    payload: {
      by: parsed.data.byName,
      to: parsed.data.newStatus,
      text:
        parsed.data.newStatus === 'resolved' && parsed.data.resolution
          ? parsed.data.resolution
          : `Statut → ${parsed.data.newStatus}`,
    },
  });

  revalidatePath(`/reclamations/${parsed.data.complaintId}`);
  return { ok: true };
}
