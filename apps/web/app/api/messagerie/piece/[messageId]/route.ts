import { NextResponse } from 'next/server';
import { accesEquipe } from '@/features/discussions/acces';
import { pieceDeLEquipe } from '@/features/espace-entreprise/pieces-jointes';

/** Un document des échanges client, pour l'équipe : fil général, ou fil direct qui vous est adressé. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { messageId: string } }) {
  // Garde : getCurrentMember, via accesEquipe.
  const moi = await accesEquipe(null);
  if (!moi.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const index = Number(new URL(req.url).searchParams.get('i') ?? '0');
  const url = Number.isInteger(index) && index >= 0 ? await pieceDeLEquipe(params.messageId, index, moi) : null;
  if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.redirect(url);
}
