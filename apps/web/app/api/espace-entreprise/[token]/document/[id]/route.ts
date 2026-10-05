import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { documentDuReferent } from '@/features/espace-entreprise/load';

/**
 * Télécharger un document depuis l'espace entreprise : le lien du référent,
 * puis la double condition — document visible pour l'entreprise, dossier dont
 * il est le référent. URL signée courte, jamais le chemin du stockage.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const doc = await documentDuReferent(lien.value.contactId, lien.value.organizationId, params.id);
  if (!doc?.storagePath) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data } = await supabaseAdmin().storage.from('documents').createSignedUrl(doc.storagePath, 120, { download: true });
  if (!data?.signedUrl) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
