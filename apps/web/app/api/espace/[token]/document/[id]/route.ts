import { NextResponse, type NextRequest } from 'next/server';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { logResourceAccess } from '@/app/(apprenant)/espace/[token]/resources';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; id: string } },
) {
  const verified = await verifyApprenantToken(params.token);
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: docRaw } = await admin
    .schema('app')
    .from('documents')
    .select('id, storage_path, dossier_id, organization_id, deleted_at')
    .eq('id', params.id)
    .maybeSingle();

  const doc = docRaw as {
    id: string;
    storage_path: string | null;
    dossier_id: string | null;
    organization_id: string;
    deleted_at: string | null;
  } | null;

  // Le document doit appartenir au dossier de l'apprenant (et à son organisation), être un PDF persisté.
  if (
    !doc ||
    doc.deleted_at !== null ||
    !doc.storage_path ||
    doc.organization_id !== verified.value.organizationId ||
    doc.dossier_id !== verified.value.dossierId
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin
    .storage
    .from('documents')
    .createSignedUrl(doc.storage_path, 120); // TTL 2 min

  if (signErr || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 });
  }

  await logResourceAccess({
    token: params.token,
    targetKind: 'document',
    targetId: doc.id,
    action: 'download',
  });

  return NextResponse.redirect(signed.signedUrl);
}
