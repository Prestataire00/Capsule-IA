import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { generateSignatureUrl } from '@/features/attendance/generate-signature-url';
import { renderQrPng } from '@/shared/lib/qr';

export const dynamic = 'force-dynamic';

// F-EMA-04 — QR code par créneau : renvoie le QR (PNG) du lien de signature
// PERSONNALISÉ d'un participant pour une feuille d'émargement. Scannable pour
// signer rapidement. À embarquer côté UI émargement via <img src=...>.
// Autorisation : l'appelant doit être authentifié ET voir la feuille (RLS staff
// de l'organisation) — un token de signature n'est émis que dans ce cas.
export async function GET(req: NextRequest, { params }: { params: { sheetId: string } }) {
  const participantId = req.nextUrl.searchParams.get('participant');
  const kindRaw = req.nextUrl.searchParams.get('kind');
  if (!participantId || (kindRaw !== 'learner' && kindRaw !== 'trainer')) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }
  if (!env.PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'public_app_url_missing' }, { status: 500 });
  }

  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // RLS : ne renvoie la feuille que si l'utilisateur (staff/formateur) y a accès.
  const { data: sheet } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id')
    .eq('id', params.sheetId)
    .maybeSingle();
  if (!sheet) return NextResponse.json({ error: 'sheet_not_found' }, { status: 404 });

  const { url } = await generateSignatureUrl({
    attendanceSheetId: params.sheetId,
    signerId: participantId,
    signerKind: kindRaw,
    baseUrl: env.PUBLIC_APP_URL,
  });

  const png = await renderQrPng(url, { width: 360 });

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Token frais à chaque rendu (consommé à l'usage) → jamais mis en cache.
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    },
  });
}
