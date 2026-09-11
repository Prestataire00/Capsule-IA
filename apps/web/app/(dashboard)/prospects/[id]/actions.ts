'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requiredDocs } from '@/features/prospect/funding';
import { convertProspectToDossier } from '@/features/crm/prospect-conversion/convert-core';
import { tryEnsureQuoteForDossier } from '@/features/billing/quotes/quote-service';
import { can } from '@/shared/lib/auth/permissions';

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

/** Dévalide une pièce : supprime l'avis de vérification → repasse « à vérifier ». */
export const unreviewProspectDocument = authActionClient
  .schema(docSchema)
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.userId as unknown as string;
    const orgId = await resolveAdminOrgId(userId);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const p = await loadProspect(parsedInput.prospectId);
    if (!p) return { ok: false as const, error: 'prospect_not_found' };
    const rowOrg = p.organization_id ?? orgId;

    const admin = (supabaseAdmin() as unknown as SupabaseClient);
    await admin
      .schema('app')
      .from('prospect_document_reviews')
      .delete()
      .eq('prospect_id', parsedInput.prospectId)
      .eq('doc_key', parsedInput.docKey);
    await recordEvent(rowOrg, parsedInput.prospectId, 'document_unverified', userId, { doc_key: parsedInput.docKey });
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

    // Conversion systématique en dossier dès validation des pièces (best-effort,
    // idempotent ; les prospects sans formation sont simplement ignorés).
    let convertedCount = 0;
    const convertedIds: string[] = [];
    for (const id of targetIds.length ? targetIds : [parsedInput.prospectId]) {
      try {
        const r = await convertProspectToDossier(admin, rowOrg, id);
        if (r.ok) {
          convertedCount++;
          convertedIds.push(r.dossierId);
        }
      } catch (e) {
        console.error('[validateProspectDemande] conversion échouée', id, e);
      }
    }

    // Le devis (un par client : l'entreprise pour tout son lot, ou le
    // particulier) s'établit à l'étape 4 — session planifiée ET analyse du
    // besoin reçue. Si c'est déjà le cas à la validation, il part d'ici.
    for (const dossierId of convertedIds) await tryEnsureQuoteForDossier(admin, dossierId);

    revalidatePath(`/prospects/${parsedInput.prospectId}`);
    revalidatePath('/prospects/nouvelles');
    revalidatePath('/prospects');
    return {
      ok: true as const,
      count: targetIds.length || 1,
      converted: convertedCount,
    };
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


// ── Notes internes ───────────────────────────────────────────────────────────
// Suivi commercial d'une demande : qui a appelé, ce qui a été dit, ce que
// l'administratif doit savoir avant de reprendre le dossier. Stockées comme
// événements `comment` — même timeline que les vérifications de pièces.

const noteSchema = z.object({
  prospectId: z.string().uuid(),
  text: z.string().trim().min(2, 'Note trop courte').max(4000),
  channel: z.enum(['note', 'call', 'email', 'meeting', 'sms']),
});

/**
 * Le commercial doit pouvoir écrire ici : on borne donc sur la section `crm`
 * (accessible aux commerciaux) plutôt que sur les seuls rôles administratifs.
 */
export const addProspectNote = authActionClient
  .schema(noteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const admin = (supabaseAdmin() as unknown as SupabaseClient);

    const { data: member } = await admin
      .schema('app')
      .from('members')
      .select('organization_id, role')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .order('is_default_org', { ascending: false })
      .limit(1)
      .maybeSingle();
    const m = member as { organization_id: string; role: string } | null;
    if (!m?.organization_id) return { ok: false as const, error: 'forbidden' as const };
    if (can(m.role, 'crm') === 'none') return { ok: false as const, error: 'forbidden' as const };

    const prospect = await loadProspect(parsedInput.prospectId);
    // Une demande d'un autre organisme n'est pas commentable.
    if (!prospect || prospect.organization_id !== m.organization_id) {
      return { ok: false as const, error: 'not_found' as const };
    }

    await recordEvent(m.organization_id, parsedInput.prospectId, 'comment', ctx.userId, {
      text: parsedInput.text,
      channel: parsedInput.channel,
    });

    revalidatePath(`/prospects/${parsedInput.prospectId}`);
    return { ok: true as const };
  });
