'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { hasTrainerSpace } from '@/shared/lib/auth/landing';
import { libre } from '@/features/trainer-space/billing';
import { billingProfileSchema, type BillingProfileInput } from '@/features/trainer-space/billing-profile-schema';

export type SaveProfileResult = { ok: true } | { ok: false; error: string };

/**
 * Profil de facturation du formateur connecté. Le prochain numéro de facture
 * ne se règle qu'avant la première facture générée (pour reprendre une
 * numérotation existante) : ensuite, la suite reste continue.
 */
export async function saveBillingProfile(input: BillingProfileInput): Promise<SaveProfileResult> {
  const p = billingProfileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (!(await hasTrainerSpace(user.id))) return { ok: false, error: 'Accès réservé aux formateurs.' };

  const admin = libre(supabaseAdmin());
  const { count } = await admin
    .schema('app')
    .from('trainer_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('source', 'generee');

  const d = p.data;
  const ligne: Record<string, unknown> = {
    user_id: user.id,
    legal_name: d.legalName,
    address_line: d.addressLine,
    postal_code: d.postalCode,
    city: d.city,
    siret: d.siret,
    vat_regime: d.vatRegime,
    vat_rate: d.vatRegime === 'assujetti' ? d.vatRate : 0,
    vat_number: d.vatNumber || null,
    iban: d.iban || null,
    bic: d.bic || null,
    invoice_prefix: d.invoicePrefix,
    updated_at: new Date().toISOString(),
  };
  if ((count ?? 0) === 0) ligne.next_invoice_number = d.nextInvoiceNumber;

  const { error } = await admin.schema('app').from('trainer_billing_profiles').upsert(ligne, { onConflict: 'user_id' });
  if (error) {
    console.error('[profil de facturation] enregistrement refusé', error.message);
    return { ok: false, error: 'L’enregistrement a échoué. Vérifiez les champs et réessayez.' };
  }
  revalidatePath('/profil-facturation');
  revalidatePath('/mes-factures');
  return { ok: true };
}
