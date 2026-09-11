import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { PROOF_MAX_BYTES, PROOF_MIME_TYPES, safeFileName } from '@/features/qualiopi/status';

/**
 * Preuves Qualiopi de niveau organisme : dépôt (POST) et téléchargement (GET).
 *
 * Aucune preuve ne pouvait être déposée jusqu'ici : la table existait, rien ne
 * l'alimentait (audit CAP-36). Autorisation explicite dans le handler — les
 * routes `/api` ne passent pas par la garde du middleware —, puis écriture en
 * service role, bornée à l'organisation du membre.
 */

const BUCKET = 'qualiopi-proofs';

export async function POST(req: Request) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'qualiopi') !== 'manage') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const fd = await req.formData();
  const fichier = fd.get('file');
  const indicatorId = String(fd.get('indicatorId') ?? '');
  const titre = String(fd.get('title') ?? '').trim();
  const validUntil = String(fd.get('validUntil') ?? '').trim();

  if (!(fichier instanceof File)) return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  if (fichier.size > PROOF_MAX_BYTES) return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  if (!(PROOF_MIME_TYPES as readonly string[]).includes(fichier.type)) {
    return NextResponse.json({ ok: false, error: 'invalid_file_type', detail: fichier.type || 'type inconnu' }, { status: 400 });
  }
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return NextResponse.json({ ok: false, error: 'invalid_date' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: indicateur } = await sb
    .schema('app')
    .from('qualiopi_indicators')
    .select('id, number')
    .eq('id', indicatorId)
    .eq('is_active', true)
    .maybeSingle();
  if (!indicateur) return NextResponse.json({ ok: false, error: 'indicateur_inconnu' }, { status: 404 });
  const numero = (indicateur as { number: number }).number;

  const chemin = `${membre.organizationId}/I${numero}/${randomUUID()}-${safeFileName(fichier.name)}`;
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(chemin, await fichier.arrayBuffer(), { contentType: fichier.type, upsert: false });
  if (upErr) {
    console.error('[qualiopi/preuves] dépôt échoué', upErr);
    return NextResponse.json({ ok: false, error: 'upload_failed', detail: upErr.message }, { status: 500 });
  }

  const { error: insErr } = await sb
    .schema('app')
    .from('qualiopi_proofs')
    .insert({
      organization_id: membre.organizationId,
      indicator_id: indicatorId,
      scope: 'organization',
      dossier_id: null,
      external_path: chemin,
      title: titre || fichier.name,
      valid_until: validUntil || null,
      created_by: membre.userId,
      metadata: { mime_type: fichier.type, size_bytes: fichier.size, original_name: fichier.name },
    } as never);
  if (insErr) {
    console.error('[qualiopi/preuves] enregistrement échoué', insErr);
    // Le fichier déposé ne sert à rien sans sa ligne : on le retire.
    await sb.storage.from(BUCKET).remove([chemin]);
    return NextResponse.json({ ok: false, error: 'db_insert_failed', detail: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Téléchargement : lien signé de 5 minutes, après vérification de l'organisation. */
export async function GET(req: Request) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'qualiopi') === 'none') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id') ?? '';
  const sb = supabaseAdmin();
  const { data: preuve } = await sb
    .schema('app')
    .from('qualiopi_proofs')
    .select('external_path')
    .eq('id', id)
    .eq('organization_id', membre.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  const chemin = (preuve as { external_path: string | null } | null)?.external_path;
  if (!chemin) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const { data: signe, error } = await sb.storage.from(BUCKET).createSignedUrl(chemin, 300);
  if (error || !signe) return NextResponse.json({ ok: false, error: 'sign_failed' }, { status: 500 });
  return NextResponse.redirect(signe.signedUrl);
}
