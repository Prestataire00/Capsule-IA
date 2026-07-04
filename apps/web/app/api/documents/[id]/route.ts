// ARCHETYPE: command
// Téléchargement d'un document (staff). Autorisation via RLS (supabaseServer) :
// si l'utilisateur voit le document, on renvoie une URL signée courte.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  const sb = supabaseServer();
  const { data: doc } = await sb
    .schema('app')
    .from('documents')
    .select('id, storage_path')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  const row = doc as { id: string; storage_path: string | null } | null;
  if (!row || !row.storage_path) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: signed, error } = await supabaseAdmin()
    .storage.from('documents')
    .createSignedUrl(row.storage_path, 120);
  if (error || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
