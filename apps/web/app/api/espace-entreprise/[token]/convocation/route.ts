import { NextResponse } from 'next/server';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { chargerEspaceComplet } from '@/features/espace-entreprise/espace-complet';
import { construireConvocationGenerale } from '@/features/espace-entreprise/convocation-generale';

/** La convocation générale du référent : ses séances à venir et leurs participants, à jour. */
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const espace = await chargerEspaceComplet(lien.value.contactId, lien.value.organizationId, params.token);
  if (!espace) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const aVenir = espace.seances.filter((s) => !s.passee);
  if (aVenir.length === 0) return NextResponse.json({ error: 'aucune_seance_a_venir' }, { status: 404 });
  const pdf = await construireConvocationGenerale({ organizationId: lien.value.organizationId, entreprise: espace.entreprise, seances: aVenir });
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${pdf.filename}"`, 'Cache-Control': 'no-store' },
  });
}
