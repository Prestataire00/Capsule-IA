import { NextResponse } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseAvatarStorage } from '@/features/identity/trainer-self/infrastructure/supabase-avatar.storage';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const fd = await req.formData();
  const raw = fd.get('file');
  if (!(raw instanceof File)) {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }
  if (raw.size > MAX) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }
  if (!ALLOWED.includes(raw.type as (typeof ALLOWED)[number])) {
    return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 });
  }

  try {
    const storage = new SupabaseAvatarStorage(supabase);
    const path = await storage.upload(user.id, raw.name, await raw.arrayBuffer(), raw.type);
    const publicUrl = storage.publicUrl(path);
    return NextResponse.json({ ok: true, path, publicUrl });
  } catch (e) {
    console.error('[avatar/upload]', e);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }
}
