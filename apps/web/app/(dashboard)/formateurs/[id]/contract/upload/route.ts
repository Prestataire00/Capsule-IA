import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';

const BUCKET = 'trainer-contracts';
const MAX = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const trainerId = params.id;
  // RLS : ne renvoie le formateur que s'il appartient à l'organisation du membre.
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
  if (raw.type !== 'application/pdf') {
    return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 });
  }

  const path = `${trainer.organization_id}/${trainerId}/contract.pdf`;

  // L'écriture est autorisée par la policy storage uniquement si admin/owner de l'org.
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, await raw.arrayBuffer(), { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    console.error('[contract/upload]', upErr);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .schema('app')
    .from('trainers')
    .update({ contract_path: path })
    .eq('id', trainerId);
  if (updErr) {
    console.error('[contract/upload] update', updErr);
    return NextResponse.json({ ok: false, error: 'db_update_failed' }, { status: 500 });
  }

  revalidatePath(`/formateurs/${trainerId}`);
  return NextResponse.json({ ok: true, path });
}
