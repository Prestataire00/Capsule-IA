import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'];

type ProspectDoc = { key: string; storage_path: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; key: string } },
) {
  // Session staff requise.
  const ssr = supabaseServer();
  const { data: auth } = await ssr.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const admin = supabaseAdmin();

  const { data: memberRow } = await admin
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', auth.user.id)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  const member = memberRow as { organization_id: string; role: string } | null;
  if (!member || !ADMIN_ROLES.includes(member.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data: prospectRow } = await admin
    .schema('app')
    .from('prospects')
    .select('organization_id, documents')
    .eq('id', params.id)
    .maybeSingle();
  const prospect = prospectRow as { organization_id: string | null; documents: ProspectDoc[] | null } | null;

  // Le prospect doit appartenir à l'org du staff (ou être non-assigné = triage).
  if (
    !prospect ||
    (prospect.organization_id !== null && prospect.organization_id !== member.organization_id)
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const doc = (prospect.documents ?? []).find((d) => d.key === params.key);
  if (!doc?.storage_path) {
    return NextResponse.json({ error: 'document_not_found' }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from('prospect-documents')
    .createSignedUrl(doc.storage_path, 120);
  if (signErr || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
