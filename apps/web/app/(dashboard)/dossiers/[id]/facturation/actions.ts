'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';

const schema = z.object({
  dossierId: z.string().uuid(),
  // Montant en centimes (0 = remet à « non renseigné » via null ci-dessous).
  amountCents: z.number().int().min(0).max(1_000_000_00),
});

/**
 * Renseigne (ou corrige) le montant total HT d'un dossier depuis l'onglet
 * Facturation. Sans ce montant, aucune ligne payeur n'est facturable (le
 * reste à charge et les allocations valent 0) : le bouton « Facturer »
 * n'apparaît jamais. Écriture via le client RLS → réservé au staff de l'org.
 */
export async function setDossierTotalAmount(formData: FormData): Promise<void> {
  await requireAccess('billing', 'manage');

  const dossierId = String(formData.get('dossierId') ?? '');
  // Accepte « 1 500,50 » ou « 1500.50 ».
  const raw = String(formData.get('amount') ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  const euros = Number.parseFloat(raw);

  const parsed = schema.safeParse({
    dossierId,
    amountCents: Number.isFinite(euros) ? Math.round(euros * 100) : Number.NaN,
  });
  if (!parsed.success) {
    redirect(`/dossiers/${dossierId}/facturation?amountError=1`);
  }

  const sb = supabaseServer();
  // 0 € → on remet à null (« non renseigné ») plutôt qu'un total nul trompeur.
  const value = parsed.data.amountCents === 0 ? null : parsed.data.amountCents;
  const { error } = await sb
    .schema('app')
    .from('dossiers')
    .update({ total_amount_cents: value } as never)
    .eq('id', parsed.data.dossierId);
  if (error) {
    redirect(`/dossiers/${parsed.data.dossierId}/facturation?amountError=1`);
  }

  revalidatePath(`/dossiers/${parsed.data.dossierId}/facturation`);
  redirect(`/dossiers/${parsed.data.dossierId}/facturation?amountSaved=1`);
}
