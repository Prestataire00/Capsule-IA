import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { SUPPORT_BUCKET } from '@/features/trainer-space/session-resources';
import { peutValiderPourMembre } from '@/features/trainer-space/validation-recipients';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { supportFichier } from '@/features/pedagogie/support-fichiers';
import { demanderModification } from '@/features/pedagogie/annotations-store';

/**
 * La version annotée d'un support : l'équipe la dépose (POST), le formateur
 * et l'équipe la téléchargent (GET). La déposer, c'est demander des
 * modifications : le support repasse « à corriger ».
 */
export const dynamic = 'force-dynamic';

const MAX_OCTETS = 20 * 1024 * 1024;
const EXTENSIONS = ['docx', 'doc', 'odt', 'pdf'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentMember();
  if (!me || !(await peutValiderPourMembre(me))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const support = await supportFichier(params.id);
  if (!support || support.organizationId !== me.organizationId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const form = await req.formData();
  const fichier = form.get('fichier');
  if (!(fichier instanceof File) || fichier.size === 0) return NextResponse.json({ error: 'Choisissez un fichier.' }, { status: 400 });
  if (fichier.size > MAX_OCTETS) return NextResponse.json({ error: 'Fichier trop volumineux (20 Mo au plus).' }, { status: 413 });
  const extension = (fichier.name.split('.').pop() ?? '').toLowerCase();
  if (!EXTENSIONS.includes(extension)) {
    return NextResponse.json({ error: 'Déposez un fichier Word (.docx), OpenDocument ou PDF.' }, { status: 400 });
  }

  const chemin = `${support.organizationId}/annotations/${support.id}/${Date.now()}.${extension}`;
  const { error: erreurDepot } = await supabaseAdmin()
    .storage.from(SUPPORT_BUCKET)
    .upload(chemin, Buffer.from(await fichier.arrayBuffer()), { contentType: fichier.type || undefined });
  if (erreurDepot) return NextResponse.json({ error: 'Le dépôt a échoué. Réessayez.' }, { status: 500 });

  const maintenant = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('session_resources' as never)
    .update({ annotated_path: chemin, annotated_at: maintenant, annotated_by: me.userId } as never)
    .eq('id', support.id);
  if (error) return NextResponse.json({ error: 'La version annotée n’a pas été enregistrée.' }, { status: 500 });

  await demanderModification('support', support.id);
  if (support.createdBy && support.createdBy !== me.userId) {
    const { error: erreurNotif } = await supabaseAdmin()
      .schema('app')
      .from('notifications')
      .insert({
        organization_id: support.organizationId,
        channel: 'in_app',
        template_code: 'support.annotated',
        recipient_user_id: support.createdBy,
        subject: `Version annotée : ${support.title}`,
        payload: { title: support.title, session_id: support.sessionId, nature: 'support' },
        status: 'sent',
        sent_at: maintenant,
        related_aggregate_type: 'session_resource',
        related_aggregate_id: support.id,
      } as never);
    if (erreurNotif) console.error('[supports] formateur non prévenu', erreurNotif.message);
  }

  revalidatePath(`/sessions/${support.sessionId}/cours`);
  revalidatePath(`/seance/${support.sessionId}/supports`);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const support = await supportFichier(params.id);
  if (!support?.annotatedPath) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const me = await getCurrentMember();
  const equipe = me !== null && me.organizationId === support.organizationId && me.role !== 'formateur';
  if (!equipe && !(await requireMyTrainerSession(support.sessionId)).ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { data } = await supabaseAdmin().storage.from(SUPPORT_BUCKET).createSignedUrl(support.annotatedPath, 300, {
    download: true,
  });
  if (!data?.signedUrl) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
