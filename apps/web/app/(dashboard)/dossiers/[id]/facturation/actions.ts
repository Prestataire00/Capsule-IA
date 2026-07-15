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

const funderLineSchema = z.object({
  dossierId: z.string().uuid(),
  funderId: z.string().uuid(),
  amountCents: z.number().int().min(0).max(1_000_000_00),
  externalFileNumber: z.string().trim().max(120).optional(),
});

/**
 * Ajoute (ou met à jour) une ligne de financement du dossier : un financeur
 * (CPF, OPCO, autofinancement…) avec son montant pris en charge HT. Chaque
 * ligne = un payeur → une convention + une facture dédiées. Le reste (total −
 * Σ lignes) devient automatiquement le « reste à charge ». Réservé au staff (RLS).
 */
export async function addDossierFunder(formData: FormData): Promise<void> {
  await requireAccess('dossiers', 'manage');

  const dossierId = String(formData.get('dossierId') ?? '');
  const funderId = String(formData.get('funderId') ?? '');
  const raw = String(formData.get('amount') ?? '').trim().replace(/\s/g, '').replace(',', '.');
  const euros = Number.parseFloat(raw);
  const externalFileNumber = String(formData.get('externalFileNumber') ?? '').trim() || undefined;

  const parsed = funderLineSchema.safeParse({
    dossierId,
    funderId,
    amountCents: Number.isFinite(euros) ? Math.round(euros * 100) : Number.NaN,
    externalFileNumber,
  });
  if (!parsed.success) {
    redirect(`/dossiers/${dossierId}/facturation?funderError=1`);
  }

  const sb = supabaseServer();
  const { data: dossierRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('organization_id')
    .eq('id', parsed.data.dossierId)
    .maybeSingle();
  const orgId = (dossierRow as { organization_id: string } | null)?.organization_id;
  if (!orgId) {
    redirect(`/dossiers/${parsed.data.dossierId}/facturation?funderError=1`);
  }

  // UNIQUE (dossier_id, funder_id) → upsert : re-saisir un financeur met à jour son montant.
  const { error } = await sb
    .schema('app')
    .from('dossier_funders')
    .upsert(
      {
        organization_id: orgId,
        dossier_id: parsed.data.dossierId,
        funder_id: parsed.data.funderId,
        amount_cents: parsed.data.amountCents,
        external_file_number: parsed.data.externalFileNumber ?? null,
        status: 'pending',
      } as never,
      { onConflict: 'dossier_id,funder_id' },
    );
  if (error) {
    redirect(`/dossiers/${parsed.data.dossierId}/facturation?funderError=1`);
  }

  revalidatePath(`/dossiers/${parsed.data.dossierId}/facturation`);
  redirect(`/dossiers/${parsed.data.dossierId}/facturation?funderSaved=1`);
}

/** Retire une ligne de financement du dossier. Réservé au staff (RLS). */
export async function removeDossierFunder(formData: FormData): Promise<void> {
  await requireAccess('dossiers', 'manage');

  const dossierId = String(formData.get('dossierId') ?? '');
  const funderId = String(formData.get('funderId') ?? '');
  if (!dossierId || !funderId) redirect(`/dossiers/${dossierId}/facturation?funderError=1`);

  const sb = supabaseServer();
  await sb
    .schema('app')
    .from('dossier_funders')
    .delete()
    .eq('dossier_id', dossierId)
    .eq('funder_id', funderId);

  revalidatePath(`/dossiers/${dossierId}/facturation`);
  redirect(`/dossiers/${dossierId}/facturation?funderSaved=1`);
}
