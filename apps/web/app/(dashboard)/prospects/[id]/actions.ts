'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requiredDocs } from '@/features/prospect/funding';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = (supabaseAdmin() as unknown as SupabaseClient);
  const { data: member } = await admin
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  const m = member as { organization_id: string; role: string } | null;
  if (!m?.organization_id) return null;
  if (!(ADMIN_ROLES as readonly string[]).includes(m.role)) return null;
  return m.organization_id;
}

type ProspectRow = {
  id: string;
  organization_id: string | null;
  situation: string | null;
  funder_kinds: string[] | null;
  company_batch_id: string | null;
};

async function loadProspect(prospectId: string): Promise<ProspectRow | null> {
  const admin = (supabaseAdmin() as unknown as SupabaseClient);
  const { data } = await admin
    .schema('app')
    .from('prospects')
    .select('id, organization_id, situation, funder_kinds, company_batch_id')
    .eq('id', prospectId)
    .maybeSingle();
  return (data as ProspectRow | null) ?? null;
}

async function recordEvent(
  orgId: string,
  prospectId: string,
  kind: string,
  actorUserId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const admin = (supabaseAdmin() as unknown as SupabaseClient);
  await admin
    .schema('app')
    .from('prospect_events')
    .insert({
      organization_id: orgId,
      prospect_id: prospectId,
      kind,
      actor_user_id: actorUserId,
      payload,
    } as never);
}

const docSchema = z.object({ prospectId: z.string().uuid(), docKey: z.string().min(1).max(120) });
const rejectDocSchema = docSchema.extend({ reason: z.string().trim().min(2).max(2000) });
const demandeSchema = z.object({ prospectId: z.string().uuid() });
const rejectDemandeSchema = demandeSchema.extend({ reason: z.string().trim().min(2).max(2000) });

async function upsertReview(
  orgId: string,
  prospectId: string,
  docKey: string,
  status: 'verified' | 'rejected',
  reviewerId: string,
  rejectedReason: string | null,
): Promise<void> {
  const admin = (supabaseAdmin() as unknown as SupabaseClient);
  await admin
    .schema('app')
    .from('prospect_document_reviews')
    .upsert(
      {
        organization_id: orgId,
        prospect_id: prospectId,
        doc_key: docKey,
        status,
        rejected_reason: rejectedReason,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'prospect_id,doc_key' },
    );
}

export const verifyProspectDocument = authActionClient
  .schema(docSchema)
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.userId as unknown as string;
    const orgId = await resolveAdminOrgId(userId);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const p = await loadProspect(parsedInput.prospectId);
    if (!p) return { ok: false as const, error: 'prospect_not_found' };
    const rowOrg = p.organization_id ?? orgId;

    await upsertReview(rowOrg, parsedInput.prospectId, parsedInput.docKey, 'verified', userId, null);
    await recordEvent(rowOrg, parsedInput.prospectId, 'document_verified', userId, { doc_key: parsedInput.docKey });
    revalidatePath(`/prospects/${parsedInput.prospectId}`);
    return { ok: true as const };
  });

export const rejectProspectDocument = authActionClient
  .schema(rejectDocSchema)
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.userId as unknown as string;
    const orgId = await resolveAdminOrgId(userId);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const p = await loadProspect(parsedInput.prospectId);
    if (!p) return { ok: false as const, error: 'prospect_not_found' };
    const rowOrg = p.organization_id ?? orgId;

    await upsertReview(rowOrg, parsedInput.prospectId, parsedInput.docKey, 'rejected', userId, parsedInput.reason);
    await recordEvent(rowOrg, parsedInput.prospectId, 'document_rejected', userId, {
      doc_key: parsedInput.docKey,
      reason: parsedInput.reason,
    });
    revalidatePath(`/prospects/${parsedInput.prospectId}`);
    return { ok: true as const };
  });

export const validateProspectDemande = authActionClient
  .schema(demandeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.userId as unknown as string;
    const orgId = await resolveAdminOrgId(userId);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const p = await loadProspect(parsedInput.prospectId);
    if (!p) return { ok: false as const, error: 'prospect_not_found' };
    const rowOrg = p.organization_id ?? orgId;
    const admin = (supabaseAdmin() as unknown as SupabaseClient);

    // Gate : toutes les pièces requises doivent être vérifiées.
    const situationForDocs = p.company_batch_id ? 'entreprise' : p.situation ?? '';
    const required = requiredDocs(p.funder_kinds ?? [], situationForDocs).filter((d) => d.required);
    if (required.length > 0) {
      const { data: reviews } = await admin
        .schema('app')
        .from('prospect_document_reviews')
        .select('doc_key, status')
        .eq('prospect_id', parsedInput.prospectId);
      const verified = new Set(
        ((reviews ?? []) as { doc_key: string; status: string }[])
          .filter((r) => r.status === 'verified')
          .map((r) => r.doc_key),
      );
      const allVerified = required.every((d) => verified.has(d.key));
      if (!allVerified) return { ok: false as const, error: 'docs_not_all_verified' };
    }

    // Cible : le prospect, ou tout le batch entreprise.
    const targetIds = p.company_batch_id
      ? ((
          await admin
            .schema('app')
            .from('prospects')
            .select('id')
            .eq('company_batch_id', p.company_batch_id)
        ).data as { id: string }[] | null ?? []).map((r) => r.id)
      : [parsedInput.prospectId];

    await admin
      .schema('app')
      .from('prospects')
      .update({
        validation_status: 'validated',
        validated_at: new Date().toISOString(),
        validated_by: userId,
      } as never)
      .in('id', targetIds.length ? targetIds : [parsedInput.prospectId]);

    await recordEvent(rowOrg, parsedInput.prospectId, 'demande_validated', userId, {
      count: targetIds.length || 1,
    });
    revalidatePath(`/prospects/${parsedInput.prospectId}`);
    revalidatePath('/prospects/nouvelles');
    return { ok: true as const, count: targetIds.length || 1 };
  });

export const rejectProspectDemande = authActionClient
  .schema(rejectDemandeSchema)
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.userId as unknown as string;
    const orgId = await resolveAdminOrgId(userId);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const p = await loadProspect(parsedInput.prospectId);
    if (!p) return { ok: false as const, error: 'prospect_not_found' };
    const rowOrg = p.organization_id ?? orgId;
    const admin = (supabaseAdmin() as unknown as SupabaseClient);

    const targetIds = p.company_batch_id
      ? ((
          await admin
            .schema('app')
            .from('prospects')
            .select('id')
            .eq('company_batch_id', p.company_batch_id)
        ).data as { id: string }[] | null ?? []).map((r) => r.id)
      : [parsedInput.prospectId];

    await admin
      .schema('app')
      .from('prospects')
      .update({
        validation_status: 'rejected',
        validation_rejected_reason: parsedInput.reason,
      } as never)
      .in('id', targetIds.length ? targetIds : [parsedInput.prospectId]);

    await recordEvent(rowOrg, parsedInput.prospectId, 'demande_rejected', userId, { reason: parsedInput.reason });
    revalidatePath(`/prospects/${parsedInput.prospectId}`);
    revalidatePath('/prospects/nouvelles');
    return { ok: true as const };
  });
