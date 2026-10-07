import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { generateQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { questionnaireDuReferent } from '@/features/espace-entreprise/acces-referent';

/** « Répondre » depuis l'espace entreprise : son questionnaire, par un lien neuf. */
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { token: string; id: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const q = await questionnaireDuReferent(lien.value.contactId, lien.value.organizationId, params.id);
  if (!q) return NextResponse.redirect(new URL(`/espace-entreprise/${params.token}?onglet=actions`, req.url));

  const signed = await generateQuestionnaireToken({ assignmentId: params.id, dossierId: q.dossierId, organizationId: lien.value.organizationId });
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('questionnaire_assignments')
    .update({ token_hash: createHash('sha256').update(signed.token).digest('hex') } as never)
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 500 });
  return NextResponse.redirect(new URL(`/questionnaire/entreprise/${signed.token}`, req.url));
}
