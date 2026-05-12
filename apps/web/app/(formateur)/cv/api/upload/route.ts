import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { SupabaseCompetencyStorage } from '@/features/identity/trainer-self/infrastructure/supabase-competency.storage';
import { AddCompetency } from '@/features/identity/trainer-self/application/commands/add-competency';
import { CompetencyKindSchema } from '@/features/identity/trainer-self/ui/schemas';
import { OrganizationId, TrainerId } from '@/features/dossier/domain/ids';

const Meta = z.object({
  trainerId: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: CompetencyKindSchema,
  title: z.string().min(1).max(200),
  issuer: z.string().max(200).optional(),
  obtainedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  const fd = await req.formData();
  const metaRaw = fd.get('meta');
  if (typeof metaRaw !== 'string') {
    return NextResponse.json({ ok: false, error: 'missing_meta' }, { status: 400 });
  }

  const meta = Meta.safeParse(JSON.parse(metaRaw));
  if (!meta.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_meta', details: meta.error.flatten() },
      { status: 400 },
    );
  }

  const rawFile = fd.get('file');
  let file: File | null = null;
  if (rawFile !== null) {
    if (!(rawFile instanceof File)) {
      return NextResponse.json({ ok: false, error: 'invalid_file' }, { status: 400 });
    }
    file = rawFile;
  }
  if (file && file.size > MAX) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }
  if (file && !ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
    return NextResponse.json({ ok: false, error: 'invalid_file_type' }, { status: 400 });
  }

  const cmd = new AddCompetency(
    new SupabaseTrainerCompetencyRepository(supabase),
    new SupabaseCompetencyStorage(supabase),
  );

  try {
    const id = await cmd.execute({
      trainerId: TrainerId(meta.data.trainerId),
      organizationId: OrganizationId(meta.data.organizationId),
      kind: meta.data.kind,
      title: meta.data.title,
      issuer: meta.data.issuer ?? null,
      obtainedAt: meta.data.obtainedAt ? new Date(meta.data.obtainedAt) : null,
      expiresAt: meta.data.expiresAt ? new Date(meta.data.expiresAt) : null,
      file: file
        ? {
            name: file.name,
            body: await file.arrayBuffer(),
            contentType: file.type,
          }
        : undefined,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[cv/upload]', e);
    return NextResponse.json({ ok: false, error: 'upload_failed' }, { status: 500 });
  }
}
