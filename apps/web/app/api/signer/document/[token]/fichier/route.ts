import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyDocumentSignatureToken } from '@/shared/lib/document-signature-token';

export const dynamic = 'force-dynamic';

/**
 * Fichier du document à signer, servi au signataire par son seul jeton.
 *
 * La page de signature ne savait afficher que les documents rédigés en HTML :
 * une convention ou une convocation générée en PDF s'annonçait « aperçu
 * indisponible », et on demandait de signer un document invisible.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const verified = await verifyDocumentSignatureToken(params.token);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 403 });

  const admin = supabaseAdmin();
  const { data: sigRow } = await admin
    .schema('app')
    .from('document_signatures')
    .select('id, status, document_id')
    .eq('id', verified.value.signatureId)
    .maybeSingle();
  const sig = sigRow as { id: string; status: string; document_id: string } | null;
  if (!sig || sig.document_id !== verified.value.documentId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: docRow } = await admin
    .schema('app')
    .from('documents')
    .select('storage_path, mime_type')
    .eq('id', sig.document_id)
    .is('deleted_at', null)
    .maybeSingle();
  const doc = docRow as { storage_path: string | null; mime_type: string | null } | null;
  if (!doc?.storage_path) return NextResponse.json({ error: 'no_file' }, { status: 404 });

  const { data: file, error } = await admin.storage.from('documents').download(doc.storage_path);
  if (error || !file) return NextResponse.json({ error: 'download_failed' }, { status: 500 });

  return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
    status: 200,
    headers: {
      'Content-Type': doc.mime_type ?? 'application/pdf',
      'Content-Disposition': 'inline; filename="document.pdf"',
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
