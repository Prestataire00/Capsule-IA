import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import {
  addFileResource,
  SUPPORT_BUCKET,
  SUPPORT_MAX_BYTES,
  SUPPORT_MIME_TYPES,
} from '@/features/trainer-space/session-resources';

/**
 * Dépôt d'un support de cours par le formateur.
 *
 * Le fichier transite par le serveur plutôt que d'aller directement au bucket :
 * le formateur externe n'a aucun droit sur `pedagogical`, et c'est la garde de
 * séance — pas une policy Storage — qui décide s'il peut déposer ici.
 */

export const runtime = 'nodejs';

const nomSain = (nom: string): string =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'support';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) {
    return NextResponse.json({ ok: false, error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 403 });
  }

  const fd = await req.formData();
  const rawFile = fd.get('file');
  if (!(rawFile instanceof File)) return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  if (rawFile.size === 0) return NextResponse.json({ ok: false, error: 'empty_file' }, { status: 400 });
  if (rawFile.size > SUPPORT_MAX_BYTES) return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  if (!(SUPPORT_MIME_TYPES as readonly string[]).includes(rawFile.type)) {
    return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 });
  }

  const titreBrut = fd.get('title');
  const titre = (typeof titreBrut === 'string' ? titreBrut : '').trim() || rawFile.name.replace(/\.[^.]+$/, '');
  if (titre.length === 0 || titre.length > 200) {
    return NextResponse.json({ ok: false, error: 'invalid_title' }, { status: 400 });
  }
  const descBrut = fd.get('description');
  const description = (typeof descBrut === 'string' ? descBrut : '').trim().slice(0, 2000) || null;

  const storagePath = `${acces.session.organization_id}/seances/${params.id}/${randomUUID()}-${nomSain(rawFile.name)}`;
  const admin = supabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(SUPPORT_BUCKET)
    .upload(storagePath, rawFile, { contentType: rawFile.type, upsert: false });
  if (upErr) {
    console.error('[supports] dépôt refusé', params.id, upErr.message);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const res = await addFileResource({
    organizationId: acces.session.organization_id,
    sessionId: params.id,
    userId: acces.userId,
    title: titre,
    description,
    storagePath,
    mimeType: rawFile.type,
    fileSizeBytes: rawFile.size,
  });
  if (!res.ok) {
    // Le fichier est déposé mais sans ligne : il serait orphelin et invisible.
    await admin.storage.from(SUPPORT_BUCKET).remove([storagePath]);
    return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
