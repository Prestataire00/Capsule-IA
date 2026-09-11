import { NextResponse } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { accessibleSheet } from '@/features/attendance/access';
import { renderCompanyAttendanceSheet } from '@/features/attendance/company-signed-sheet';

export const dynamic = 'force-dynamic';

// Feuille d'émargement signée d'une entreprise cliente (`?companyId=`) :
// ses salariés et le formateur seulement. Réservée à l'équipe et au formateur.
export async function GET(req: Request, { params }: { params: { sheetId: string } }) {
  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const companyId = new URL(req.url).searchParams.get('companyId');
  if (!companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 });

  const sheet = await renderCompanyAttendanceSheet(supabaseServer(), {
    sheetId: params.sheetId,
    sessionId: acces.value.session_id,
    organizationId: acces.value.organization_id,
    companyId,
  });
  if (!sheet) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return new NextResponse(new Uint8Array(sheet.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="emargement-${sheet.date}-${sheet.halfDay}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
