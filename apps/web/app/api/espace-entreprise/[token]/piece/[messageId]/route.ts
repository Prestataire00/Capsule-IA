import { NextResponse } from 'next/server';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { pieceDuReferent } from '@/features/espace-entreprise/pieces-jointes';

/** Un document des échanges, pour le référent : seulement ceux de son propre fil. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { token: string; messageId: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const index = Number(new URL(req.url).searchParams.get('i') ?? '0');
  const url = Number.isInteger(index) && index >= 0 ? await pieceDuReferent(params.messageId, index, lien.value) : null;
  if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.redirect(url);
}
