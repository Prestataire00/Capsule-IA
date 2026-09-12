// ARCHETYPE: command
// Consultation / téléchargement d'un document (staff). Autorisation via RLS
// (supabaseServer) : si l'utilisateur voit le document, on lui sert le fichier.
//
// Le fichier est relayé depuis NOTRE domaine, pas par une redirection vers l'URL
// signée du stockage : Safari refuse d'afficher un PDF d'un autre domaine dans un
// cadre intégré, et l'aperçu restait blanc. `?dl=1` force le téléchargement.
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Nom de fichier sûr pour l'en-tête Content-Disposition. */
function safeName(title: string | null, path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? 'pdf';
  const base = (title ?? 'document')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ._-]/g, '')
    .trim()
    .slice(0, 80) || 'document';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
  const sb = supabaseServer();
  const { data: doc } = await sb
    .schema('app')
    .from('documents')
    .select('id, title, storage_path, mime_type, source_url')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();

  const row = doc as {
    id: string;
    title: string | null;
    storage_path: string | null;
    mime_type: string | null;
    source_url: string | null;
  } | null;
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Document « vivant » : on régénère depuis les données à jour plutôt que de
  // servir la copie archivée, qui peut dater d'avant une signature ou un
  // changement de montant. `?fige=1` force la copie telle qu'elle a été
  // archivée (utile pour une preuve). Les pièces figées n'ont pas de source_url.
  if (row.source_url && req.nextUrl.searchParams.get('fige') !== '1') {
    return NextResponse.redirect(new URL(row.source_url, req.nextUrl.origin));
  }
  if (!row.storage_path) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: signed, error } = await supabaseAdmin()
    .storage.from('documents')
    .createSignedUrl(row.storage_path, 120);
  if (error || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 });
  }

  const upstream = await fetch(signed.signedUrl);
  if (!upstream.ok || !upstream.body) {
    console.error('[api/documents] lecture du fichier impossible:', upstream.status, row.storage_path);
    return NextResponse.json({ error: 'file_unreadable' }, { status: 502 });
  }

  const disposition = req.nextUrl.searchParams.get('dl') === '1' ? 'attachment' : 'inline';
  const headers = new Headers({
    'Content-Type': row.mime_type ?? upstream.headers.get('content-type') ?? 'application/octet-stream',
    'Content-Disposition': `${disposition}; filename="${safeName(row.title, row.storage_path)}"`,
    'Cache-Control': 'private, max-age=60',
  });
  const length = upstream.headers.get('content-length');
  if (length) headers.set('Content-Length', length);

  return new Response(upstream.body, { headers });
}
