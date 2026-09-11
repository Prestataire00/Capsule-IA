import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { accessibleSheet } from '@/features/attendance/access';
import { issueAttendanceLink } from '@/features/attendance/issue-attendance-link';
import { renderQrPng } from '@/shared/lib/qr';

export const dynamic = 'force-dynamic';

// QR du lien PERSONNEL d'un participant pour une feuille (à imprimer ou à
// afficher). L'appelant doit voir la feuille (équipe ou formateur de la
// séance), et le participant doit être attendu sur la séance : un identifiant
// quelconque ne suffit plus à obtenir un lien de signature.
export async function GET(req: NextRequest, { params }: { params: { sheetId: string } }) {
  const participantId = req.nextUrl.searchParams.get('participant');
  const kindRaw = req.nextUrl.searchParams.get('kind');
  if (!participantId || (kindRaw !== 'learner' && kindRaw !== 'trainer')) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }
  if (!env.PUBLIC_APP_URL) return NextResponse.json({ error: 'public_app_url_missing' }, { status: 500 });

  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const { data: attendus } = await supabaseAdmin()
    .schema('app')
    .rpc('session_expected_signers' as never, { p_session_id: acces.value.session_id } as never);
  const attendu = ((attendus ?? []) as { participant_kind: string; participant_id: string }[]).some(
    (e) => e.participant_kind === kindRaw && e.participant_id === participantId,
  );
  if (!attendu) return NextResponse.json({ error: 'signer_not_expected' }, { status: 404 });

  const r = await issueAttendanceLink({ sheetId: params.sheetId, signerId: participantId, signerKind: kindRaw, baseUrl: env.PUBLIC_APP_URL });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });

  const png = await renderQrPng(r.link.url, { width: 360 });
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
  });
}
