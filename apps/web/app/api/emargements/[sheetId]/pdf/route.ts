import { NextResponse } from 'next/server';
import { accessibleSheet } from '@/features/attendance/access';
import { rendrePdfFeuille } from '@/features/attendance/pdf-feuille';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { supabaseServer } from '@/shared/lib/supabase/server';

/**
 * Le PDF d'une feuille encore ouverte, à jour à l'instant de la demande : pour
 * l'extraire sans attendre la clôture. Rien n'est conservé ; la version qui
 * fait foi reste celle de la clôture.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { sheetId: string } }) {
  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });
  const vue = await loadSessionEmargement(supabaseServer(), acces.value.session_id);
  const feuille = vue?.sheets.find((s) => s.id === params.sheetId);
  if (!vue || !feuille) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { pdf } = await rendrePdfFeuille({ sheetId: feuille.id, organizationId: acces.value.organization_id, feuille, vue });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="emargement-${feuille.halfDay}-provisoire.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
