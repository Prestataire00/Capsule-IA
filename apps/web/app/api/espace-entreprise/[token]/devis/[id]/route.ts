import { NextResponse } from 'next/server';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { devisDuReferent } from '@/features/espace-entreprise/acces-referent';
import { pdfDuDevis } from '@/features/billing/quotes/pdf-du-devis';

/** Le PDF d'un devis de son entreprise (signé quand il l'est), fabriqué à la demande. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const devis = await devisDuReferent(lien.value.contactId, lien.value.organizationId, params.id);
  if (!devis) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const r = await pdfDuDevis(devis.quoteId);
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(Buffer.from(r.pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${r.nom}"`, 'Cache-Control': 'private, no-store' },
  });
}
