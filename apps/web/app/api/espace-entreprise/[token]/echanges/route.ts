import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { messageAvecPieceSchema } from '@/features/espace-entreprise/message.schema';
import { ecrireDepuisLEspace } from '@/features/espace-entreprise/ecrire-depuis-l-espace';
import { deposerPiece, MESSAGE_ERREUR_PIECE, retirerPiece } from '@/features/espace-entreprise/pieces-jointes';

/**
 * Le référent envoie un document, avec ou sans texte. Route plutôt que Server
 * Action : celles-ci plafonnent le corps à quelques Mo.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const lien = await verifyEntrepriseToken(params.token);
  if (!lien.ok) return NextResponse.json({ ok: false, error: 'Ce lien n’est plus valable.' }, { status: 403 });
  const fd = await req.formData();
  const fichier = fd.get('file');
  if (!(fichier instanceof File)) return NextResponse.json({ ok: false, error: 'Aucun document joint.' }, { status: 400 });
  const p = messageAvecPieceSchema.safeParse({ body: String(fd.get('body') ?? ''), interlocuteur: String(fd.get('interlocuteur') ?? '') || null });
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' }, { status: 400 });

  const piece = await deposerPiece(lien.value.organizationId, lien.value.contactId, fichier);
  if (!piece.ok) return NextResponse.json({ ok: false, error: MESSAGE_ERREUR_PIECE[piece.error] }, { status: 400 });
  const r = await ecrireDepuisLEspace({ ...lien.value, body: p.data.body, interlocuteur: p.data.interlocuteur ?? null, pieces: [piece.value] });
  if (!r.ok) {
    await retirerPiece(piece.value);
    return NextResponse.json(r, { status: 400 });
  }
  revalidatePath(`/espace-entreprise/${params.token}`);
  return NextResponse.json({ ok: true });
}
