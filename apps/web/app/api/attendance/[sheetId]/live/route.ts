import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { accessibleSheet } from '@/features/attendance/access';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { nextRotation, nomProjete } from '@/features/attendance/room-code';
import { roomUrl } from '@/features/attendance/room';
import type { LivePayload } from '@/features/attendance/room-live';
import { renderQrDataUrl } from '@/shared/lib/qr';

export const dynamic = 'force-dynamic';

// Écran en direct du formateur : QR tournant et état de chaque participant.
// Réservé à qui gère l'émargement et voit la feuille (équipe, formateur).
export async function GET(_req: Request, { params }: { params: { sheetId: string } }) {
  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });
  if (!env.PUBLIC_APP_URL) return NextResponse.json({ error: 'public_app_url_missing' }, { status: 500 });

  const vue = await loadSessionEmargement(supabaseServer(), acces.value.session_id);
  const feuille = vue?.sheets.find((s) => s.id === params.sheetId);
  if (!feuille) return NextResponse.json({ error: 'attendance_sheet_not_found' }, { status: 404 });

  const now = Date.now();
  const attendus = feuille.participants.filter((p) => p.expected);
  const apprenants = attendus.filter((p) => p.kind === 'learner');
  const payload: LivePayload = {
    qr: feuille.finalized ? null : await renderQrDataUrl(roomUrl(env.PUBLIC_APP_URL, feuille.id, now), { width: 560 }),
    rotatesAt: nextRotation(now),
    finalized: feuille.finalized,
    windowStart: feuille.windowStart,
    windowEnd: feuille.windowEnd,
    expected: apprenants.length,
    entered: apprenants.filter((p) => p.entryAt || p.attestedAt).length,
    exited: apprenants.filter((p) => p.exitAt).length,
    participants: attendus.map((p) => ({
      key: `${p.kind}:${p.id}`,
      name: nomProjete(p.fullName),
      kind: p.kind,
      state: p.state,
      entryAt: p.entryAt ?? p.attestedAt,
      exitAt: p.exitAt,
    })),
  };
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
