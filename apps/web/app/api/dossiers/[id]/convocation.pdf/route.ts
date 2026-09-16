import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { buildConvocationPdf } from '@/features/documents/build-convocation-pdf';
import { canAccessDossier } from '@/features/documents/guard-dossier-access';
import { persistGeneratedDocument } from '@/features/documents/persist-document';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Convocation de l'apprenant du dossier à une séance : ?session=<id>.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canAccessDossier(params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const sessionId = req.nextUrl.searchParams.get('session') ?? '';
  if (!UUID.test(sessionId)) return NextResponse.json({ error: 'session_required' }, { status: 400 });

  const sb = admin();
  const built = await buildConvocationPdf(sb, { sessionId, dossierId: params.id });
  if (!built) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Archivée comme l'attestation : sans cela, la convocation s'ouvrait mais ne
  // rejoignait jamais les documents du dossier — donc impossible à envoyer par
  // e-mail depuis l'écran, qui promet pourtant l'inverse.
  try {
    await persistGeneratedDocument(sb as never, {
      organizationId: built.organizationId,
      dossierId: params.id,
      kind: 'convocation',
      title: built.title,
      bytes: built.bytes,
      generationInput: { session_id: sessionId, dossier_id: params.id },
      // Document vivant : horaires, lieu et formateur peuvent changer jusqu'au jour J.
      sourceKey: `convocation:${params.id}:${sessionId}`,
      sourceUrl: `/api/dossiers/${params.id}/convocation.pdf?session=${sessionId}`,
      metadata: { session_id: sessionId },
    });
  } catch (e) {
    console.error('[convocation] persist failed', e);
  }

  return new NextResponse(new Uint8Array(built.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${built.filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
