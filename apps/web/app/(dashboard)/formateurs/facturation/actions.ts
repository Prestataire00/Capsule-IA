'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { libre, prevenirFormateur } from '@/features/trainer-space/billing';
import { CATEGORIES_FRAIS, formatEuros } from '@/features/trainer-space/billing-rules';

/**
 * Décisions de l'organisme sur les factures et notes de frais de ses
 * formateurs : membre qui GÈRE la facturation, document de SON organisme,
 * transition autorisée seulement depuis l'état attendu (pas de double décision).
 */

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function gestionFacturation(): Promise<{ ok: true; userId: string; organizationId: string } | { ok: false; error: string }> {
  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'billing') !== 'manage') return { ok: false, error: 'Votre rôle ne permet pas de traiter la facturation.' };
  return { ok: true, userId: membre.userId, organizationId: membre.organizationId };
}

async function emailFormateur(trainerId: string): Promise<string | null> {
  const { data } = await libre(supabaseAdmin()).schema('app').from('trainers').select('email').eq('id', trainerId).maybeSingle();
  return (data as { email: string | null } | null)?.email ?? null;
}

const noteNettoyee = (n: unknown) => (typeof n === 'string' ? n.trim().slice(0, 500) || null : null);

export async function decideTrainerInvoice(input: { id: string; decision: 'validee' | 'refusee'; note?: string | null }): Promise<Result> {
  if (!UUID.test(input?.id ?? '') || (input.decision !== 'validee' && input.decision !== 'refusee')) return { ok: false, error: 'Saisie invalide.' };
  const g = await gestionFacturation();
  if (!g.ok) return g;
  const note = noteNettoyee(input.note);
  if (input.decision === 'refusee' && !note) return { ok: false, error: 'Indiquez le motif du refus.' };

  const { data, error } = await libre(supabaseAdmin())
    .schema('app')
    .from('trainer_invoices')
    .update({ status: input.decision, decided_by: g.userId, decided_at: new Date().toISOString(), decision_note: note })
    .eq('id', input.id)
    .eq('organization_id', g.organizationId)
    .eq('status', 'soumise')
    .select('trainer_id, number, total_cents');
  if (error) {
    console.error('[facturation formateurs] décision refusée', error.message);
    return { ok: false, error: 'La décision n’a pas pu être enregistrée.' };
  }
  const f = (data ?? [])[0] as { trainer_id: string; number: string; total_cents: number } | undefined;
  if (!f) return { ok: false, error: 'Cette facture a déjà été traitée.' };

  await prevenirFormateur(
    await emailFormateur(f.trainer_id),
    g.organizationId,
    input.decision === 'validee' ? `Facture ${f.number} validée` : `Facture ${f.number} refusée`,
    input.decision === 'validee'
      ? [`Votre facture ${f.number} de ${formatEuros(Number(f.total_cents))} a été validée ; elle sera réglée à l’échéance.`]
      : [`Votre facture ${f.number} a été refusée.`, `Motif : ${note}`],
    '/mes-factures',
  );
  revalidatePath('/formateurs/facturation');
  return { ok: true };
}

export async function markTrainerInvoicePaid(input: { id: string }): Promise<Result> {
  if (!UUID.test(input?.id ?? '')) return { ok: false, error: 'Saisie invalide.' };
  const g = await gestionFacturation();
  if (!g.ok) return g;
  const { data, error } = await libre(supabaseAdmin())
    .schema('app')
    .from('trainer_invoices')
    .update({ status: 'payee', paid_at: new Date().toISOString(), paid_by: g.userId })
    .eq('id', input.id)
    .eq('organization_id', g.organizationId)
    .eq('status', 'validee')
    .select('trainer_id, number, total_cents');
  if (error) {
    console.error('[facturation formateurs] paiement non enregistré', error.message);
    return { ok: false, error: 'Le paiement n’a pas pu être enregistré.' };
  }
  const f = (data ?? [])[0] as { trainer_id: string; number: string; total_cents: number } | undefined;
  if (!f) return { ok: false, error: 'Seule une facture validée peut être marquée payée.' };
  await prevenirFormateur(
    await emailFormateur(f.trainer_id),
    g.organizationId,
    `Facture ${f.number} payée`,
    [`Le règlement de votre facture ${f.number} (${formatEuros(Number(f.total_cents))}) a été effectué.`],
    '/mes-factures',
  );
  revalidatePath('/formateurs/facturation');
  return { ok: true };
}

export async function decideTrainerExpense(input: { id: string; decision: 'validee' | 'refusee'; note?: string | null }): Promise<Result> {
  if (!UUID.test(input?.id ?? '') || (input.decision !== 'validee' && input.decision !== 'refusee')) return { ok: false, error: 'Saisie invalide.' };
  const g = await gestionFacturation();
  if (!g.ok) return g;
  const note = noteNettoyee(input.note);
  if (input.decision === 'refusee' && !note) return { ok: false, error: 'Indiquez le motif du refus.' };

  const { data, error } = await libre(supabaseAdmin())
    .schema('app')
    .from('trainer_expenses')
    .update({ status: input.decision, decided_by: g.userId, decided_at: new Date().toISOString(), decision_note: note })
    .eq('id', input.id)
    .eq('organization_id', g.organizationId)
    .eq('status', 'soumise')
    .select('trainer_id, category, label, amount_cents');
  if (error) {
    console.error('[facturation formateurs] décision refusée', error.message);
    return { ok: false, error: 'La décision n’a pas pu être enregistrée.' };
  }
  const d = (data ?? [])[0] as { trainer_id: string; category: string; label: string; amount_cents: number } | undefined;
  if (!d) return { ok: false, error: 'Cette dépense a déjà été traitée.' };
  const quoi = `${CATEGORIES_FRAIS[d.category] ?? d.category} « ${d.label} » (${formatEuros(Number(d.amount_cents))})`;
  await prevenirFormateur(
    await emailFormateur(d.trainer_id),
    g.organizationId,
    input.decision === 'validee' ? 'Note de frais validée' : 'Note de frais refusée',
    input.decision === 'validee' ? [`Votre dépense ${quoi} a été validée ; elle vous sera remboursée.`] : [`Votre dépense ${quoi} a été refusée.`, `Motif : ${note}`],
    '/mes-frais',
  );
  revalidatePath('/formateurs/facturation');
  return { ok: true };
}

export async function markTrainerExpenseReimbursed(input: { id: string }): Promise<Result> {
  if (!UUID.test(input?.id ?? '')) return { ok: false, error: 'Saisie invalide.' };
  const g = await gestionFacturation();
  if (!g.ok) return g;
  const { data, error } = await libre(supabaseAdmin())
    .schema('app')
    .from('trainer_expenses')
    .update({ status: 'remboursee', reimbursed_at: new Date().toISOString(), reimbursed_by: g.userId })
    .eq('id', input.id)
    .eq('organization_id', g.organizationId)
    .eq('status', 'validee')
    .select('trainer_id, label, amount_cents');
  if (error) {
    console.error('[facturation formateurs] remboursement non enregistré', error.message);
    return { ok: false, error: 'Le remboursement n’a pas pu être enregistré.' };
  }
  const d = (data ?? [])[0] as { trainer_id: string; label: string; amount_cents: number } | undefined;
  if (!d) return { ok: false, error: 'Seule une dépense validée peut être marquée remboursée.' };
  await prevenirFormateur(
    await emailFormateur(d.trainer_id),
    g.organizationId,
    'Note de frais remboursée',
    [`Votre dépense « ${d.label} » (${formatEuros(Number(d.amount_cents))}) a été remboursée.`],
    '/mes-frais',
  );
  revalidatePath('/formateurs/facturation');
  return { ok: true };
}
