import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseServer } from '@/shared/lib/supabase/server';

/**
 * Dépôt (POST) ou retrait (DELETE) du livret d'accueil de l'organisme (0233).
 * Une route plutôt qu'une Server Action : un livret illustré dépasse la
 * limite de taille des actions. Écrit sous la session du membre : la RLS
 * d'org_assets et d'organizations réserve l'écriture à la direction.
 */
export const runtime = 'nodejs';

const MAX = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) return NextResponse.json({ ok: false, error: 'Réservé à la direction de l’organisme.' }, { status: 403 });
  const fd = await req.formData();
  const fichier = fd.get('file');
  if (!(fichier instanceof File) || fichier.size === 0) return NextResponse.json({ ok: false, error: 'Choisissez un fichier PDF.' }, { status: 400 });
  if (fichier.size > MAX) return NextResponse.json({ ok: false, error: 'Le livret dépasse 20 Mo.' }, { status: 400 });
  const bytes = new Uint8Array(await fichier.arrayBuffer());
  try {
    await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'Le fichier ne s’ouvre pas comme un PDF.' }, { status: 400 });
  }

  const sb = supabaseServer();
  const path = `${me.organizationId}/livret-accueil.pdf`;
  const { error: upErr } = await sb.storage.from('org_assets').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) return NextResponse.json({ ok: false, error: `Dépôt impossible : ${upErr.message}` }, { status: 500 });
  const { data, error } = await sb
    .schema('app')
    .from('organizations')
    .update({ livret_accueil_path: path } as never)
    .eq('id', me.organizationId)
    .select('id');
  if (error || !data || (data as unknown[]).length === 0) return NextResponse.json({ ok: false, error: 'Le livret n’a pas pu être enregistré.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const me = await getCurrentMember();
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) return NextResponse.json({ ok: false, error: 'Réservé à la direction de l’organisme.' }, { status: 403 });
  const sb = supabaseServer();
  const { error } = await sb.schema('app').from('organizations').update({ livret_accueil_path: null } as never).eq('id', me.organizationId);
  if (error) return NextResponse.json({ ok: false, error: 'Le livret n’a pas pu être retiré.' }, { status: 500 });
  const { error: rmErr } = await sb.storage.from('org_assets').remove([`${me.organizationId}/livret-accueil.pdf`]);
  if (rmErr) console.error('[livret] fichier non retiré', rmErr.message);
  return NextResponse.json({ ok: true });
}
