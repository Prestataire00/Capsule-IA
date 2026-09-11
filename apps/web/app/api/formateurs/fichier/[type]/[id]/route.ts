import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { BILLING_BUCKET, libre } from '@/features/trainer-space/billing';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// L'organisme ouvre la facture ou le justificatif d'un de ses formateurs :
// membre ayant accès à la facturation, document de SON organisme, URL signée d'une minute.
export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'billing') === 'none') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!UUID.test(params.id) || (params.type !== 'facture' && params.type !== 'frais')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const admin = libre(supabaseAdmin());
  const { data } =
    params.type === 'facture'
      ? await admin.schema('app').from('trainer_invoices').select('pdf_path').eq('id', params.id).eq('organization_id', membre.organizationId).maybeSingle()
      : await admin.schema('app').from('trainer_expenses').select('receipt_path').eq('id', params.id).eq('organization_id', membre.organizationId).maybeSingle();
  const ligne = data as { pdf_path?: string | null; receipt_path?: string | null } | null;
  const chemin = ligne?.pdf_path ?? ligne?.receipt_path ?? null;
  if (!chemin) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: signe } = await supabaseAdmin().storage.from(BILLING_BUCKET).createSignedUrl(chemin, 60);
  if (!signe?.signedUrl) return NextResponse.json({ error: 'signed_url_failed' }, { status: 500 });
  return NextResponse.redirect(signe.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
