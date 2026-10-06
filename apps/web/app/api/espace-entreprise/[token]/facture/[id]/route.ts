import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { factureDuReferent } from '@/features/espace-entreprise/load';
import { buildInvoicePdf } from '@/features/billing/invoices/invoice-pdf';

/**
 * Le PDF d'une facture depuis l'espace entreprise : le lien du référent, puis
 * la facture doit être l'une des siennes (dossier dont il est le référent,
 * adressée à l'entreprise, émise). Produit à la demande, jamais archivé ici.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await factureDuReferent(lien.value.contactId, lien.value.organizationId, params.id))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const pdf = await buildInvoicePdf(supabaseAdmin() as unknown as SupabaseClient, params.id, lien.value.organizationId);
  if (!pdf) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.reference.replace(/[^\w.-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
