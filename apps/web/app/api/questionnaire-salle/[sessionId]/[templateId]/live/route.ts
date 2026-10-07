import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { accessibleSession } from '@/features/attendance/access';
import { nextRotation } from '@/features/attendance/room-code';
import { etatSalleQuestionnaire, urlSalleQuestionnaire } from '@/features/questionnaire/questionnaire-salle';
import { renderQrDataUrl } from '@/shared/lib/qr';

export const dynamic = 'force-dynamic';

// Écran projeté d'un questionnaire de la séance : QR tournant et réponses.
// Réservé à l'équipe et au formateur de la séance.
export async function GET(_req: Request, { params }: { params: { sessionId: string; templateId: string } }) {
  const acces = await accessibleSession(params.sessionId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });
  if (!env.PUBLIC_APP_URL) return NextResponse.json({ error: 'public_app_url_missing' }, { status: 500 });
  const etat = await etatSalleQuestionnaire(params.sessionId, params.templateId);
  if (!etat) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const now = Date.now();
  return NextResponse.json(
    {
      qr: await renderQrDataUrl(urlSalleQuestionnaire(env.PUBLIC_APP_URL, params.sessionId, params.templateId, now), { width: 560 }),
      rotatesAt: nextRotation(now),
      ...etat,
    },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
