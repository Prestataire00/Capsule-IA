import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { accessibleSheet } from '@/features/attendance/access';
import { markJustifiedAbsence, storeJustification } from '@/features/attendance/justifications';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Dépôt d'un justificatif par l'équipe ou le formateur, pour un apprenant
// attendu sur la feuille. Accepté d'office ; l'absence devient « excusée »
// si la feuille est ouverte et que l'apprenant n'a pas signé.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const sheetId = String(form.get('sheetId') ?? '');
  const learnerId = String(form.get('learnerId') ?? '');
  if (!UUID.test(sheetId) || !UUID.test(learnerId)) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const acces = await accessibleSheet(sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const { data: attendus } = await supabaseAdmin()
    .schema('app')
    .rpc('session_expected_signers' as never, { p_session_id: acces.value.session_id } as never);
  const attendu = ((attendus ?? []) as { participant_kind: string; participant_id: string }[]).some(
    (e) => e.participant_kind === 'learner' && e.participant_id === learnerId,
  );
  if (!attendu) return NextResponse.json({ error: 'signer_not_expected' }, { status: 404 });

  const fichier = form.get('file');
  const commentaire = form.get('comment');
  const r = await storeJustification({
    organizationId: acces.value.organization_id,
    sheetId,
    learnerId,
    file: fichier instanceof File ? fichier : null,
    comment: typeof commentaire === 'string' ? commentaire : null,
    via: 'equipe',
    actor: acces.userId,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  const marked = await markJustifiedAbsence({
    sheetId,
    learnerId,
    reason: (typeof commentaire === 'string' && commentaire.trim().slice(0, 500)) || 'Justificatif fourni à l’organisme',
    actor: acces.userId,
  });
  return NextResponse.json({ ok: true, marked });
}
