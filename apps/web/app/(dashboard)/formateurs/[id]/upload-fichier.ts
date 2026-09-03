import 'server-only';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

/**
 * Dépôt d'un fichier rattaché à un formateur — photo, CV, contrat.
 *
 * Les trois routes déposaient avec le **client RLS**, sans aucune garde dans le
 * handler : l'autorisation reposait entièrement sur les policies de
 * `storage.objects`, lesquelles exigent `app.is_admin_or_owner()` et une
 * correspondance d'organisation lue dans le jeton. Le moindre écart y renvoie un
 * refus indifférencié, que la route traduisait en « upload_failed » et l'écran
 * en « Échec de l'envoi » — sans jamais dire pourquoi (audit CAP-25).
 *
 * Le reste du code fait l'inverse, et c'est le bon sens de lecture : on autorise
 * explicitement, puis on écrit en service role. La création d'un formateur
 * procède déjà ainsi, ce qui explique qu'elle, elle fonctionne.
 */
export type Reglages = {
  readonly bucket: string;
  readonly maxOctets: number;
  /** Type MIME accepté → extension de fichier. */
  readonly types: Record<string, string>;
  readonly chemin: (orgId: string, trainerId: string, ext: string) => string;
  /** Colonne de `app.trainers` où ranger le chemin. */
  readonly colonne: 'photo_path' | 'cv_path' | 'contract_path';
};

export async function deposerFichierFormateur(
  req: Request,
  trainerId: string,
  r: Reglages,
): Promise<NextResponse> {
  const membre = await getCurrentMember();
  if (!membre) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  if (membre.role !== 'owner' && membre.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const { data: trainer } = await sb
    .schema('app')
    .from('trainers')
    .select('id, organization_id')
    .eq('id', trainerId)
    .eq('organization_id', membre.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!trainer) {
    return NextResponse.json({ ok: false, error: 'trainer_not_found' }, { status: 404 });
  }

  const fd = await req.formData();
  const brut = fd.get('file');
  if (!(brut instanceof File)) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }
  if (brut.size > r.maxOctets) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }
  const ext = r.types[brut.type];
  if (!ext) {
    // Le type est renvoyé : « HEIC » est le cas courant d'une photo prise sur
    // iPhone, et l'utilisateur ne peut pas le deviner depuis son album.
    return NextResponse.json(
      { ok: false, error: 'invalid_file_type', detail: brut.type || 'type inconnu' },
      { status: 400 },
    );
  }

  const chemin = r.chemin((trainer as { organization_id: string }).organization_id, trainerId, ext);
  const { error: upErr } = await sb.storage
    .from(r.bucket)
    .upload(chemin, await brut.arrayBuffer(), { contentType: brut.type, upsert: true });
  if (upErr) {
    console.error(`[formateurs/${r.colonne}] dépôt échoué`, upErr);
    return NextResponse.json({ ok: false, error: 'upload_failed', detail: upErr.message }, { status: 500 });
  }

  const { error: majErr } = await sb
    .schema('app')
    .from('trainers')
    .update({ [r.colonne]: chemin } as never)
    .eq('id', trainerId);
  if (majErr) {
    console.error(`[formateurs/${r.colonne}] mise à jour échouée`, majErr);
    return NextResponse.json({ ok: false, error: 'db_update_failed', detail: majErr.message }, { status: 500 });
  }

  revalidatePath(`/formateurs/${trainerId}`);
  revalidatePath('/formateurs');
  return NextResponse.json({ ok: true, path: chemin });
}
