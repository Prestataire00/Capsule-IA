import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { buildInvoicePdf } from '@/features/billing/invoices/invoice-pdf';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  // Le middleware laisse passer /api sans session : sans cette garde, l'UUID de
  // facture suffisait à télécharger le PDF (identité de l'apprenant, SIRET, montants).
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (can(me.role, 'billing') === 'none') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const pdf = await buildInvoicePdf(supabaseAdmin() as unknown as SupabaseClient, params.id, me.organizationId, {
    persist: true,
  });
  if (!pdf) return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });

  return new NextResponse(new Uint8Array(pdf.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="facture-${pdf.reference}.pdf"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
