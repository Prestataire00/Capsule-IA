import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { accesEquipe } from '@/features/discussions/acces';
import { messageAvecPieceSchema } from '@/features/espace-entreprise/message.schema';
import { contactDeLOrganisme } from '@/features/espace-entreprise/messages-store';
import { deposerPiece, MESSAGE_ERREUR_PIECE, retirerPiece } from '@/features/espace-entreprise/pieces-jointes';
import { repondreAuContact } from '@/features/espace-entreprise/repondre-au-client';

/** L'équipe envoie un document au référent d'un client, dans le fil de son espace. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { contactId: string } }) {
  // Garde : getCurrentMember, via accesEquipe (membre de l'équipe, pas formateur).
  const moi = await accesEquipe(null);
  if (!moi.ok) return NextResponse.json({ ok: false, error: 'La messagerie ne vous est pas accessible.' }, { status: 403 });
  if (!(await contactDeLOrganisme(moi.organizationId, params.contactId))) {
    return NextResponse.json({ ok: false, error: 'Ce client ne vous est pas accessible.' }, { status: 404 });
  }
  const fd = await req.formData();
  const fichier = fd.get('file');
  if (!(fichier instanceof File)) return NextResponse.json({ ok: false, error: 'Aucun document joint.' }, { status: 400 });
  const p = messageAvecPieceSchema.safeParse({ body: String(fd.get('body') ?? ''), interlocuteur: String(fd.get('interlocuteur') ?? '') || null });
  if (!p.success) return NextResponse.json({ ok: false, error: p.error.issues[0]?.message ?? 'Message invalide.' }, { status: 400 });
  const interlocuteur = p.data.interlocuteur ?? null;
  // Un fil direct ne se répond que par son destinataire.
  if (interlocuteur && interlocuteur !== moi.userId) return NextResponse.json({ ok: false, error: 'Ce fil est adressé à un collègue.' }, { status: 403 });

  const piece = await deposerPiece(moi.organizationId, params.contactId, fichier);
  if (!piece.ok) return NextResponse.json({ ok: false, error: MESSAGE_ERREUR_PIECE[piece.error] }, { status: 400 });
  const r = await repondreAuContact({
    organizationId: moi.organizationId,
    contactId: params.contactId,
    dossierId: null,
    auteurNom: moi.nom,
    auteurUserId: moi.userId,
    interlocuteurUserId: interlocuteur,
    body: p.data.body,
    pieces: [piece.value],
  });
  if (!r.ok) {
    await retirerPiece(piece.value);
    return NextResponse.json(r, { status: 400 });
  }
  revalidatePath('/messagerie');
  return NextResponse.json({ ok: true });
}
