import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { buildCertificatPdf } from '@/features/documents/build-certificat-pdf';
import { canAccessDossier } from '@/features/documents/guard-dossier-access';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canAccessDossier(params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const built = await buildCertificatPdf(admin(), params.id, { persist: true });
  if (!built) return NextResponse.json({ error: 'dossier_not_found' }, { status: 404 });

  return new NextResponse(new Uint8Array(built.bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="certificat-${built.reference}.pdf"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
