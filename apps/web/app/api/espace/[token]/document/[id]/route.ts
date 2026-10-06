import { NextResponse, type NextRequest } from 'next/server';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { documentVisiblePourLeStagiaire } from '@/features/documents/convention-destinataire';
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
    .select('id, kind, storage_path, dossier_id, organization_id, deleted_at, visible_entreprise, dossier:dossiers(company_id)')
    .eq('id', params.id)
    .maybeSingle();

  const doc = docRaw as {
    id: string;
    kind: string;
    visible_entreprise: boolean;
    dossier: { company_id: string | null } | Array<{ company_id: string | null }> | null;
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
    doc.dossier_id !== verified.value.dossierId ||
    // Un document interne, ou la convention d'une entreprise, n'est pas pour le stagiaire.
    !documentVisiblePourLeStagiaire(
      { visibleEntreprise: doc.visible_entreprise, kind: doc.kind },
      { companyId: (Array.isArray(doc.dossier) ? doc.dossier[0] : doc.dossier)?.company_id ?? null },
    )
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
