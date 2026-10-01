// ARCHETYPE: command
// Le document signé (staff) : le PDF archivé suivi du certificat de
// signature électronique. Autorisation via RLS (supabaseServer) : si
// l'utilisateur voit le document, il voit sa version signée.
import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { construirePdfSigne, signaturesDuDocument } from '@/features/documents/document-signe';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  const { data: doc } = await supabaseServer()
    .schema('app')
    .from('documents')
    .select('id, title, storage_path')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  const row = doc as { id: string; title: string | null; storage_path: string | null } | null;
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const admin = supabaseAdmin() as unknown as SupabaseClient;
  const signatures = await signaturesDuDocument(admin, row.id);
  if (signatures.length === 0) return NextResponse.json({ error: 'not_signed' }, { status: 404 });

  const pdf = await construirePdfSigne(admin, row, signatures);
  if (!pdf) return NextResponse.json({ error: 'no_pdf' }, { status: 404 });

  const nom = `${(row.title ?? 'document')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ._-]/g, '')
    .trim()
    .slice(0, 70) || 'document'} - signe.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.nextUrl.searchParams.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${nom}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
