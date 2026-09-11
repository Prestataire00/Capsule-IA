'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import {
  BILLING_BUCKET,
  libre,
  loadBillingProfile,
  organisationClient,
  prevenirOrganisme,
  profilComplet,
  seancesFacturables,
} from '@/features/trainer-space/billing';
import { formatEuros, totaux } from '@/features/trainer-space/billing-rules';
import { dayKey } from '@/features/trainer-space/dates';
import { generateTrainerInvoicePdf } from '@/features/trainer-space/trainer-invoice-pdf';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR_MS = 24 * 60 * 60 * 1000;

export type CreateInvoiceResult = { ok: true; id: string; number: string } | { ok: false; error: string };

/**
 * Facture générée dans Capsule : les lignes et les montants sont RECALCULÉS
 * ici, depuis les séances terminées non facturées et le tarif fixé par
 * l'organisme — le navigateur n'envoie aucun montant.
 */
export async function createGeneratedInvoice(input: { organizationId: string; notes?: string | null }): Promise<CreateInvoiceResult> {
  if (typeof input?.organizationId !== 'string' || !UUID.test(input.organizationId)) return { ok: false, error: 'invalid_payload' };
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const profil = await loadBillingProfile(user.id);
  if (!profilComplet(profil)) return { ok: false, error: 'profile_incomplete' };
  const facturable = await seancesFacturables(user.id, input.organizationId);
  if (!facturable) return { ok: false, error: 'forbidden' };
  if (facturable.lignes.length === 0) return { ok: false, error: 'nothing_to_invoice' };
  const { fiche, lignes } = facturable;
  const t = totaux(lignes, profil.vat_regime, Number(profil.vat_rate));

  const admin = libre(supabaseAdmin());
  const { data: numero, error: numErr } = await admin.schema('app').rpc('next_trainer_invoice_number', { p_user_id: user.id });
  if (numErr || typeof numero !== 'string') {
    console.error('[facture formateur] numérotation impossible', numErr?.message);
    return { ok: false, error: 'numbering_failed' };
  }

  const id = randomUUID();
  const emission = dayKey(new Date());
  const echeance = dayKey(new Date(Date.now() + 30 * JOUR_MS));
  const nom = `${fiche.first_name} ${fiche.last_name}`.trim();
  const notes = input.notes?.trim().slice(0, 1000) || null;
  const { error: insErr } = await admin.schema('app').from('trainer_invoices').insert({
    id,
    organization_id: input.organizationId,
    trainer_id: fiche.id,
    user_id: user.id,
    source: 'generee',
    number: numero,
    issue_date: emission,
    due_date: echeance,
    subtotal_cents: t.subtotalCents,
    vat_cents: t.vatCents,
    total_cents: t.totalCents,
    expected_subtotal_cents: t.subtotalCents,
    status: 'soumise',
    notes,
    issuer_snapshot: {
      trainer_name: nom,
      email: fiche.email,
      legal_name: profil.legal_name,
      address_line: profil.address_line,
      postal_code: profil.postal_code,
      city: profil.city,
      country: profil.country,
      siret: profil.siret,
      vat_regime: profil.vat_regime,
      vat_rate: profil.vat_rate,
      vat_number: profil.vat_number,
      iban: profil.iban,
      bic: profil.bic,
    },
  });
  if (insErr) {
    console.error('[facture formateur] enregistrement refusé', insErr.message);
    return { ok: false, error: 'invoice_insert_failed' };
  }

  const annuler = async () => {
    await admin.schema('app').from('trainer_invoices').delete().eq('id', id);
  };
  const [{ error: lErr }, { error: sErr }] = await Promise.all([
    admin.schema('app').from('trainer_invoice_lines').insert(
      lignes.map((l, i) => ({
        invoice_id: id,
        session_id: l.sessionId,
        position: i,
        label: l.label,
        quantity: l.quantity,
        unit: l.unit,
        unit_price_cents: l.unitPriceCents,
        total_cents: l.totalCents,
      })),
    ),
    admin.schema('app').from('trainer_invoice_sessions').insert(lignes.map((l) => ({ invoice_id: id, session_id: l.sessionId }))),
  ]);
  if (lErr || sErr) {
    console.error('[facture formateur] lignes refusées', lErr?.message ?? sErr?.message);
    await annuler();
    return { ok: false, error: 'invoice_insert_failed' };
  }

  const client = await organisationClient(input.organizationId);
  let pdf: Uint8Array;
  try {
    pdf = await generateTrainerInvoicePdf({
      number: numero,
      issueDate: emission,
      dueDate: echeance,
      issuer: {
        legalName: profil.legal_name ?? nom,
        addressLines: [profil.address_line ?? '', `${profil.postal_code ?? ''} ${profil.city ?? ''}`.trim(), profil.country !== 'France' ? profil.country : ''].filter(Boolean),
        siret: profil.siret,
        vatNumber: profil.vat_number,
        email: fiche.email,
        iban: profil.iban,
        bic: profil.bic,
      },
      client: { name: client.name, addressLines: client.addressLines, siret: client.siret },
      lines: lignes,
      vatRegime: profil.vat_regime,
      vatRate: Number(profil.vat_rate),
      subtotalCents: t.subtotalCents,
      vatCents: t.vatCents,
      totalCents: t.totalCents,
      notes,
    });
  } catch (e) {
    console.error('[facture formateur] PDF non généré', e);
    await annuler();
    return { ok: false, error: 'pdf_failed' };
  }

  const chemin = `${input.organizationId}/${fiche.id}/factures/${id}.pdf`;
  const up = await supabaseAdmin().storage.from(BILLING_BUCKET).upload(chemin, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) {
    console.error('[facture formateur] dépôt du PDF refusé', up.error.message);
    await annuler();
    return { ok: false, error: 'pdf_failed' };
  }
  await admin.schema('app').from('trainer_invoices').update({ pdf_path: chemin }).eq('id', id);

  await prevenirOrganisme(input.organizationId, `Nouvelle facture de ${nom}`, [
    `${nom} vous a transmis la facture ${numero} de ${formatEuros(t.totalCents)} pour ${lignes.length} séance${lignes.length > 1 ? 's' : ''}.`,
    'Vous pouvez la consulter, la valider ou la refuser depuis la facturation des formateurs.',
  ]);
  revalidatePath('/mes-factures');
  return { ok: true, id, number: numero };
}
