import { NextResponse } from 'next/server';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/** Le livret d'accueil de l'organisme, pour le référent d'un de ses clients (0233). */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const admin = supabaseAdmin();
  const { data } = await admin
    .schema('app')
    .from('organizations')
    .select('name, livret_accueil_path' as never)
    .eq('id', lien.value.organizationId)
    .maybeSingle();
  const org = data as { name: string; livret_accueil_path: string | null } | null;
  if (!org?.livret_accueil_path) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data: fichier, error } = await admin.storage.from('org_assets').download(org.livret_accueil_path);
  if (error || !fichier) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const nom = `livret-accueil-${org.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'organisme'}.pdf`;
  return new NextResponse(Buffer.from(await fichier.arrayBuffer()), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nom}"`, 'Cache-Control': 'private, no-store' },
  });
}
