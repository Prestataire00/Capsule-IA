// ARCHETYPE: workflow
// Justification: identité de facturation du formateur — une seule chose à faire, remplir et enregistrer.

import { supabaseServer } from '@/shared/lib/supabase/server';
import { libre, loadBillingProfile } from '@/features/trainer-space/billing';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { BillingProfileForm } from './billing-profile-form';

export const dynamic = 'force-dynamic';

export default async function ProfilFacturationPage() {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return null;
  const [profil, { count }] = await Promise.all([
    loadBillingProfile(user.id),
    libre(supabaseAdmin()).schema('app').from('trainer_invoices').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('source', 'generee'),
  ]);

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Profil de facturation</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Ces informations figurent sur les factures que vous générez depuis Capsule, pour tous vos organismes.
        </p>
      </header>
      <BillingProfileForm
        numerotationLibre={(count ?? 0) === 0}
        initial={{
          legalName: profil?.legal_name ?? '',
          addressLine: profil?.address_line ?? '',
          postalCode: profil?.postal_code ?? '',
          city: profil?.city ?? '',
          siret: profil?.siret ?? '',
          vatRegime: profil?.vat_regime ?? 'franchise',
          vatRate: String(profil?.vat_rate ?? 20),
          vatNumber: profil?.vat_number ?? '',
          iban: profil?.iban ?? '',
          bic: profil?.bic ?? '',
          invoicePrefix: profil?.invoice_prefix ?? 'FAC',
          nextInvoiceNumber: String(profil?.next_invoice_number ?? 1),
        }}
      />
    </div>
  );
}
