import { NextResponse } from 'next/server';
import { publicOrigin } from '@/shared/lib/http/public-origin';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { ouvrirQuestionnairePrevu } from '@/features/espace-entreprise/ouvrir-questionnaire';

/** Un questionnaire prévu, débloqué le jour dit : on crée sa réponse, puis on y va. */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const dossierId = url.searchParams.get('dossier') ?? '';
  const templateId = url.searchParams.get('modele') ?? '';
  const retour = new URL(`/espace-entreprise/${params.token}?onglet=questionnaires`, publicOrigin(req));
  if (!UUID.test(dossierId) || !UUID.test(templateId)) return NextResponse.redirect(retour);
  const id = await ouvrirQuestionnairePrevu({ ...lien.value, token: params.token, dossierId, templateId });
  if (!id) return NextResponse.redirect(retour);
  return NextResponse.redirect(new URL(`/espace-entreprise/${params.token}/questionnaire/${id}`, publicOrigin(req)));
}
