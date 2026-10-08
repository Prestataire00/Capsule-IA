import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { pdfDuDevis } from '@/features/billing/quotes/pdf-du-devis';

/** Le devis en PDF (signé quand il l'est), pour l'équipe : à ouvrir ou télécharger. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Garde : le devis lu sous les droits du membre (RLS).
  const { data } = await supabaseServer().schema('app').from('quotes' as never).select('id').eq('id' as never, params.id as never).is('deleted_at' as never, null).maybeSingle();
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await pdfDuDevis(params.id);
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(Buffer.from(r.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${req.nextUrl.searchParams.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${r.nom}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
