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

  // module_resources absent des types générés (Docker down au moment de db:types)
  const { data: resourceRaw } = await admin
    .schema('app')
    .from('module_resources' as never)
    .select('id, storage_path, module_id, organization_id, is_published, deleted_at')
    .eq('id', params.id)
    .maybeSingle();

  const resource = resourceRaw as {
    id: string;
    storage_path: string;
    module_id: string;
    organization_id: string;
    is_published: boolean;
    deleted_at: string | null;
  } | null;

  if (
    !resource ||
    resource.deleted_at !== null ||
    resource.is_published !== true ||
    resource.organization_id !== verified.value.organizationId
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Vérifie que le module appartient au dossier de l'apprenant
  const { data: link } = await admin
    .schema('app')
    .from('dossier_modules')
    .select('id')
    .eq('dossier_id', verified.value.dossierId)
    .eq('module_id', resource.module_id)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin
    .storage
    .from('pedagogical')
    .createSignedUrl(resource.storage_path, 120); // TTL 2 min

  if (signErr || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 });
  }

  await logResourceAccess({
    token: params.token,
    targetKind: 'module_resource',
    targetId: resource.id,
    action: 'download',
  });

  return NextResponse.redirect(signed.signedUrl);
}
