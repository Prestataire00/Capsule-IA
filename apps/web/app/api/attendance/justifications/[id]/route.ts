import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { accessibleSheet } from '@/features/attendance/access';
import { JUSTIFICATION_BUCKET } from '@/features/attendance/justifications';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ouvre un justificatif : réservé à qui gère la feuille concernée ; URL
// signée d'une minute, jamais d'accès direct au seau.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'justification_not_found' }, { status: 404 });
  const sb = supabaseAdmin();
  const { data } = await sb
    .schema('app')
    .from('attendance_justifications' as never)
    .select('attendance_sheet_id, storage_path, file_name')
    .eq('id' as never, params.id as never)
    .maybeSingle();
  const j = data as { attendance_sheet_id: string; storage_path: string; file_name: string } | null;
  if (!j) return NextResponse.json({ error: 'justification_not_found' }, { status: 404 });

  const acces = await accessibleSheet(j.attendance_sheet_id);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const { data: signe } = await sb.storage.from(JUSTIFICATION_BUCKET).createSignedUrl(j.storage_path, 60);
  if (!signe?.signedUrl) return NextResponse.json({ error: 'signed_url_failed' }, { status: 500 });
  return NextResponse.redirect(signe.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } });
}
