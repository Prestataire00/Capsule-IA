import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifySignatureToken } from '@/shared/lib/signature-token';
import { storeJustification } from '@/features/attendance/justifications';

export const dynamic = 'force-dynamic';

// Justificatif déposé par l'apprenant depuis son lien d'émargement : le jeton
// désigne la feuille et l'apprenant ; il doit avoir été émis et non révoqué.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const verified = await verifySignatureToken(params.token);
  if (!verified.ok || verified.value.signerKind !== 'learner') return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  const { attendanceSheetId, signerId, jti } = verified.value;

  const { data } = await supabaseAdmin()
    .schema('app')
    .from('attendance_token_jtis' as never)
    .select('organization_id, status')
    .eq('jti' as never, jti as never)
    .maybeSingle();
  const jeton = data as { organization_id: string; status: string } | null;
  if (!jeton || jeton.status === 'revoked') return NextResponse.json({ error: 'invalid_token' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  const fichier = form.get('file');
  const commentaire = form.get('comment');
  const r = await storeJustification({
    organizationId: jeton.organization_id,
    sheetId: attendanceSheetId,
    learnerId: signerId,
    file: fichier instanceof File ? fichier : null,
    comment: typeof commentaire === 'string' ? commentaire : null,
    via: 'apprenant',
    actor: null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
