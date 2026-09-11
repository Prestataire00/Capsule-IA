import { NextResponse } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { accessibleSheet } from '@/features/attendance/access';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { renderPaperSheet } from '@/features/attendance/paper-sheet-pdf';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const PARIS = 'Europe/Paris';
const jour = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: PARIS }).format(new Date(iso));
const heure = (iso: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(new Date(iso));

// Feuille papier de secours d'une demi-journée, noms pré-remplis. Réservée à
// l'équipe et au formateur de la séance.
export async function GET(_req: Request, { params }: { params: { sheetId: string } }) {
  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const vue = await loadSessionEmargement(supabaseServer(), acces.value.session_id);
  const feuille = vue?.sheets.find((s) => s.id === params.sheetId);
  if (!vue || !feuille) return NextResponse.json({ error: 'attendance_sheet_not_found' }, { status: 404 });

  const { data: org } = await supabaseServer().schema('app').from('organizations').select('name').eq('id', acces.value.organization_id).maybeSingle();
  const pdf = await renderPaperSheet({
    organizationName: (org as { name: string } | null)?.name ?? '',
    formationTitle: vue.session.title ?? 'Formation',
    slotLabel: `${jour(feuille.windowStart)} · ${HALF_DAY[feuille.halfDay] ?? 'Journée'} ${heure(feuille.windowStart)}–${heure(feuille.windowEnd)}`,
    learners: feuille.participants.filter((p) => p.kind === 'learner' && p.expected).map((p) => p.fullName),
    trainers: feuille.participants.filter((p) => p.kind === 'trainer' && p.expected).map((p) => p.fullName),
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="emargement-papier-${feuille.windowStart.slice(0, 10)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
