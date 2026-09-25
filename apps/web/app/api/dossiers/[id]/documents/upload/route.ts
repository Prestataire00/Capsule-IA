import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { PROOF_MAX_BYTES, PROOF_MIME_TYPES } from '@/features/qualiopi/status';
import { TEMPLATE_KINDS } from '@/app/(dashboard)/documents/modeles/schema';

/**
 * Dépôt d'une pièce dans un dossier, avec son type — et, si elle en est une,
 * son rattachement à un indicateur Qualiopi.
 *
 * Route dédiée plutôt que Server Action : celles-ci sont bornées à 5 Mo de
 * corps, et une attestation scannée les dépasse vite.
 *
 * Le rattachement Qualiopi est ce qui manquait le plus : déposer un fichier
 * dans `app.documents` ne satisfaisait aucun indicateur. Seule une ligne
 * `qualiopi_proofs` de portée `dossier` le fait — et aucune interface ne savait
 * en créer, la route existante forçant la portée « organisme ».
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const membre = await getCurrentMember();
  if (!membre) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  if (can(membre.role, 'dossiers') !== 'manage') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  if (!UUID.test(params.id)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

  const sb = supabaseAdmin();
  // Le dossier doit être celui de l'organisme du membre : l'identifiant vient
  // de l'URL, il ne prouve rien par lui-même.
  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', membre.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!dossier) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const fd = await req.formData();
  const fichier = fd.get('file');
  const kind = String(fd.get('kind') ?? 'autre');
  const titre = String(fd.get('title') ?? '').trim();
  const indicatorId = String(fd.get('indicatorId') ?? '').trim();
  // Ce qu'on sait du document et que son nom ne dit pas. Dans `metadata`, qui
  // est déjà du JSONB : une colonne de plus pour une note facultative aurait
  // coûté une migration sans rien apporter.
  const commentaire = String(fd.get('comment') ?? '').trim().slice(0, 1000);

  if (!(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }
  if (fichier.size > PROOF_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }
  if (!(PROOF_MIME_TYPES as readonly string[]).includes(fichier.type)) {
    return NextResponse.json(
      { ok: false, error: 'invalid_file_type', detail: fichier.type || 'type inconnu' },
      { status: 400 },
    );
  }
  if (!(TEMPLATE_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ ok: false, error: 'invalid_kind' }, { status: 400 });
  }

  const ext = fichier.name.includes('.') ? fichier.name.split('.').pop()!.toLowerCase().slice(0, 8) : 'bin';
  const chemin = `dossiers/${params.id}/${randomUUID()}.${ext}`;
  const octets = new Uint8Array(await fichier.arrayBuffer());

  const { error: erreurStockage } = await sb.storage
    .from('documents')
    .upload(chemin, octets, { contentType: fichier.type, upsert: false });
  if (erreurStockage) {
    console.error('[dossier] dépôt de pièce impossible', params.id, erreurStockage.message);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const { data: doc, error: erreurLigne } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: membre.organizationId,
      dossier_id: params.id,
      kind,
      title: (titre || fichier.name).slice(0, 200),
      status: 'ready',
      storage_path: chemin,
      file_size_bytes: fichier.size,
      uploaded_by: membre.userId,
      metadata: {
        depose: true,
        nom_origine: fichier.name.slice(0, 200),
        mime: fichier.type,
        ...(commentaire ? { commentaire } : {}),
      },
    } as never)
    .select('id')
    .single();

  if (erreurLigne || !doc) {
    // Sans cette reprise, le fichier resterait seul dans le stockage, invisible
    // et impossible à retrouver.
    await sb.storage.from('documents').remove([chemin]);
    console.error('[dossier] pièce non enregistrée', params.id, erreurLigne?.message);
    return NextResponse.json({ ok: false, error: 'db_failed' }, { status: 500 });
  }
  const documentId = (doc as { id: string }).id;

  // Rattachement Qualiopi : c'est la preuve de portée « dossier » qui coche
  // l'indicateur, et elle déclenche le recalcul de la checklist (0143).
  let indicateurRattache = false;
  if (indicatorId && UUID.test(indicatorId)) {
    const { data: indicateur } = await sb
      .schema('app')
      .from('qualiopi_indicators')
      .select('id, scope')
      .eq('id', indicatorId)
      .maybeSingle();
    const ind = indicateur as { id: string; scope: string } | null;
    if (ind?.scope === 'dossier') {
      const { error: erreurPreuve } = await sb
        .schema('app')
        .from('qualiopi_proofs')
        .insert({
          organization_id: membre.organizationId,
          indicator_id: ind.id,
          scope: 'dossier',
          dossier_id: params.id,
          document_id: documentId,
          title: (titre || fichier.name).slice(0, 200),
          created_by: membre.userId,
        } as never);
      if (erreurPreuve) console.error('[dossier] preuve Qualiopi non créée', erreurPreuve.message);
      else indicateurRattache = true;
    }
  }

  return NextResponse.json({ ok: true, documentId, indicateurRattache });
}
