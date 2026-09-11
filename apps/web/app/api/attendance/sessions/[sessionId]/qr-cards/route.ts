import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { accessibleSession } from '@/features/attendance/access';
import { issueAttendanceLink } from '@/features/attendance/issue-attendance-link';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { renderQrCardsPdf, type QrCard } from '@/features/attendance/qr-cards-pdf';
import { loadOrgIdentity } from '@/features/documents/load-org-identity';
import { orgIdentityLines } from '@/features/documents/legal/org-identity';
import { renderQrPng } from '@/shared/lib/qr';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const jour = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(iso));

// Planche PDF des QR personnels d'une séance (ou d'une seule feuille, ?sheet=),
// pour les apprenants qui n'ont pas fini de signer. Réservée à l'équipe et au
// formateur de la séance.
export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  if (!env.PUBLIC_APP_URL) return NextResponse.json({ error: 'public_app_url_missing' }, { status: 500 });
  const acces = await accessibleSession(params.sessionId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const vue = await loadSessionEmargement(supabaseServer(), params.sessionId);
  if (!vue) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  const seule = req.nextUrl.searchParams.get('sheet');

  const cards: QrCard[] = [];
  for (const sheet of vue.sheets) {
    if (sheet.finalized || (seule && sheet.id !== seule)) continue;
    for (const p of sheet.participants) {
      if (p.kind !== 'learner' || !p.expected || (p.state !== 'a_signer' && p.state !== 'entree_seule')) continue;
      const lien = await issueAttendanceLink({
        sheetId: sheet.id,
        signerId: p.id,
        signerKind: 'learner',
        baseUrl: env.PUBLIC_APP_URL,
        channel: 'equipe',
        issuedBy: acces.userId,
      });
      if (!lien.ok) continue;
      const png = await renderQrPng(lien.link.url, { width: 300 });
      cards.push({
        name: p.fullName,
        formationTitle: vue.session.title ?? 'Formation',
        slotLabel: `${jour(sheet.windowStart)} · ${HALF_DAY[sheet.halfDay] ?? 'Journée'}`,
        qrDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      });
    }
  }
  if (cards.length === 0) return NextResponse.json({ error: 'aucun_qr_a_imprimer' }, { status: 404 });

  const identity = await loadOrgIdentity(supabaseServer() as never, acces.value.organization_id);
  const pdf = await renderQrCardsPdf(
    `Émargement — ${vue.session.title ?? 'Séance'} · ${jour(vue.session.startsAt)}`,
    cards,
    orgIdentityLines(identity),
  );
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="qr-emargement-${vue.session.startsAt.slice(0, 10)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
