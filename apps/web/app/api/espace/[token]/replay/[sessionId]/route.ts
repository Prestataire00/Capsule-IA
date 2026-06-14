import { NextResponse, type NextRequest } from 'next/server';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { logResourceAccess } from '@/app/(apprenant)/espace/[token]/resources';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; sessionId: string } },
) {
  const verified = await verifyApprenantToken(params.token);
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { dossierId } = verified.value;

  // Vérifie que la session appartient au dossier de l'apprenant :
  // soit via app.sessions.dossier_id (ancien modèle)
  // soit via app.session_dossiers (sessions partagées, migrations 0052-0055)
  const [byDirect, byJunction] = await Promise.all([
    admin
      .schema('app')
      .from('sessions')
      .select('id')
      .eq('id', params.sessionId)
      .eq('dossier_id', dossierId)
      .maybeSingle(),
    admin
      .schema('app')
      .from('session_dossiers' as never)
      .select('session_id')
      .eq('session_id', params.sessionId)
      .eq('dossier_id', dossierId)
      .maybeSingle(),
  ]);

  if (!byDirect.data && !byJunction.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Charge l'enregistrement publié le plus récent
  const { data: recordingRaw } = await admin
    .schema('app')
    .from('session_recordings' as never)
    .select('id, play_url, passcode')
    .eq('session_id', params.sessionId)
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const recording = recordingRaw as {
    id: string;
    play_url: string;
    passcode: string | null;
  } | null;

  if (!recording) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Log accès best-effort
  void logResourceAccess({
    token: params.token,
    targetKind: 'replay',
    targetId: recording.id,
    action: 'download',
  });

  return NextResponse.redirect(recording.play_url);
}
