import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { storeJustification } from '@/features/attendance/justifications';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Justificatif déposé depuis l'espace apprenant : la feuille doit appartenir
// à une séance du dossier de l'apprenant, qui doit y être attendu.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const verified = await verifyApprenantToken(params.token);
  if (!verified.ok) return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  const { learnerId, organizationId, dossierId } = verified.value;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const sheetId = String(form.get('sheetId') ?? '');
  if (!UUID.test(sheetId)) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: feuille } = await sb.schema('app').from('attendance_sheets').select('organization_id, session_id').eq('id', sheetId).maybeSingle();
  const f = feuille as { organization_id: string; session_id: string } | null;
  if (!f || f.organization_id !== organizationId) return NextResponse.json({ error: 'attendance_sheet_not_found' }, { status: 404 });

  const [direct, jonction, attendus] = await Promise.all([
    sb.schema('app').from('sessions').select('id').eq('id', f.session_id).eq('dossier_id', dossierId).maybeSingle(),
    sb.schema('app').from('session_dossiers' as never).select('session_id').eq('session_id' as never, f.session_id as never).eq('dossier_id' as never, dossierId as never).maybeSingle(),
    sb.schema('app').rpc('session_expected_signers' as never, { p_session_id: f.session_id } as never),
  ]);
  const duDossier = Boolean(direct.data) || Boolean(jonction.data);
  const attendu = ((attendus.data ?? []) as { participant_kind: string; participant_id: string }[]).some(
    (e) => e.participant_kind === 'learner' && e.participant_id === learnerId,
  );
  if (!duDossier || !attendu) return NextResponse.json({ error: 'attendance_sheet_not_found' }, { status: 404 });

  const fichier = form.get('file');
  const commentaire = form.get('comment');
  const r = await storeJustification({
    organizationId,
    sheetId,
    learnerId,
    file: fichier instanceof File ? fichier : null,
    comment: typeof commentaire === 'string' ? commentaire : null,
    via: 'apprenant',
    actor: null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
