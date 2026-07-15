import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';

const BUCKET = 'trainer-photos';
const MAX = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const trainerId = params.id;
  const { data: trainer } = await supabase
    .schema('app')
    .from('trainers')
    .select('id, organization_id')
    .eq('id', trainerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!trainer) return NextResponse.json({ ok: false, error: 'trainer_not_found' }, { status: 404 });

  const fd = await req.formData();
  const raw = fd.get('file');
  if (!(raw instanceof File)) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }
  if (raw.size > MAX) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }
  const ext = TYPES[raw.type];
  if (!ext) {
    return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 });
  }

  const path = `${trainer.organization_id}/${trainerId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, await raw.arrayBuffer(), { contentType: raw.type, upsert: true });
  if (upErr) {
    console.error('[photo/upload]', upErr);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .schema('app')
    .from('trainers')
    .update({ photo_path: path } as never)
    .eq('id', trainerId);
  if (updErr) {
    console.error('[photo/upload] update', updErr);
    return NextResponse.json({ ok: false, error: 'db_update_failed' }, { status: 500 });
  }

  revalidatePath(`/formateurs/${trainerId}`);
  revalidatePath('/formateurs');
  return NextResponse.json({ ok: true, path });
}
