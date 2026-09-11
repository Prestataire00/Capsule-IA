'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import {
  DossierQuoteSchema,
  QuoteIdSchema,
  QuoteStatusSchema,
  SaveQuoteSchema,
} from '@/features/billing/quotes/quote-schema';
import {
  coveredDossierIds,
  createInvoiceFromQuote,
  ensureQuoteForDossier,
  markQuoteSigned,
  sendQuoteForSignature,
  setQuoteStatus,
  updateDraftQuote,
} from '@/features/billing/quotes/quote-service';

// Les Server Actions ne passent pas par le middleware : chaque action vérifie
// elle-même le droit « facturation / gérer » et borne tout à l'organisme du
// membre (le client service_role ne filtre rien de lui-même).
async function billingManager(): Promise<{ organizationId: string } | null> {
  const me = await getCurrentMember();
  if (!me || can(me.role, 'billing') !== 'manage') return null;
  return { organizationId: me.organizationId };
}

const admin = () => supabaseAdmin() as unknown as SupabaseClient;

async function revalidateQuote(sb: SupabaseClient, quoteId: string): Promise<void> {
  revalidatePath(`/devis/${quoteId}`);
  revalidatePath('/devis');
  for (const dossierId of await coveredDossierIds(sb, quoteId)) {
    revalidatePath(`/dossiers/${dossierId}`, 'layout');
  }
}

export const saveQuote = authActionClient.schema(SaveQuoteSchema).action(async ({ parsedInput }) => {
  const me = await billingManager();
  if (!me) return { ok: false as const, error: 'forbidden' };
  const sb = admin();
  const r = await updateDraftQuote(sb, parsedInput.quoteId, me.organizationId, {
    object: parsedInput.object,
    notes: parsedInput.notes || null,
    validUntil: parsedInput.validUntil,
    vatRate: parsedInput.vatRate,
    recipientName: parsedInput.recipientName || null,
    recipientEmail: parsedInput.recipientEmail || null,
    lines: parsedInput.lines,
  });
  if (!r.ok) return { ok: false as const, error: r.error };
  await revalidateQuote(sb, parsedInput.quoteId);
  return { ok: true as const };
});

export const sendQuote = authActionClient.schema(QuoteIdSchema).action(async ({ parsedInput }) => {
  const me = await billingManager();
  if (!me) return { ok: false as const, error: 'forbidden' };
  const sb = admin();
  const r = await sendQuoteForSignature(sb, parsedInput.quoteId, me.organizationId);
  if (!r.ok) return { ok: false as const, error: r.error };
  await revalidateQuote(sb, parsedInput.quoteId);
  return { ok: true as const, email: r.email };
});

export const changeQuoteStatus = authActionClient.schema(QuoteStatusSchema).action(async ({ parsedInput }) => {
  const me = await billingManager();
  if (!me) return { ok: false as const, error: 'forbidden' };
  const sb = admin();

  if (parsedInput.status === 'signed') {
    const { data } = await sb
      .schema('app')
      .from('quotes')
      .select('organization_id')
      .eq('id', parsedInput.quoteId)
      .maybeSingle();
    if ((data as { organization_id?: string } | null)?.organization_id !== me.organizationId) {
      return { ok: false as const, error: 'not_found' };
    }
    const r = await markQuoteSigned(sb, parsedInput.quoteId, 'manual');
    if (!r.ok) return { ok: false as const, error: r.error };
  } else {
    const r = await setQuoteStatus(sb, parsedInput.quoteId, me.organizationId, parsedInput.status);
    if (!r.ok) return { ok: false as const, error: r.error };
  }
  await revalidateQuote(sb, parsedInput.quoteId);
  revalidatePath('/factures');
  return { ok: true as const };
});

export const generateQuoteForDossier = authActionClient.schema(DossierQuoteSchema).action(async ({ parsedInput }) => {
  const me = await billingManager();
  if (!me) return { ok: false as const, error: 'forbidden' };
  const sb = admin();
  const r = await ensureQuoteForDossier(sb, parsedInput.dossierId, {
    force: true,
    organizationId: me.organizationId,
  });
  if (!r.ok) return { ok: false as const, error: r.reason };
  await revalidateQuote(sb, r.quoteId);
  return { ok: true as const, quoteId: r.quoteId };
});

export const invoiceFromQuote = authActionClient.schema(QuoteIdSchema).action(async ({ parsedInput }) => {
  const me = await billingManager();
  if (!me) return { ok: false as const, error: 'forbidden' };
  const sb = admin();
  const { data } = await sb
    .schema('app')
    .from('quotes')
    .select('organization_id')
    .eq('id', parsedInput.quoteId)
    .maybeSingle();
  if ((data as { organization_id?: string } | null)?.organization_id !== me.organizationId) {
    return { ok: false as const, error: 'not_found' };
  }
  const r = await createInvoiceFromQuote(sb, parsedInput.quoteId);
  if (!r.ok) return { ok: false as const, error: r.error };
  await revalidateQuote(sb, parsedInput.quoteId);
  revalidatePath('/factures');
  return { ok: true as const, invoiceId: r.invoiceId };
});
