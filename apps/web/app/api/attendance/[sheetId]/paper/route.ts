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
// `?companyId=` : feuille d'une entreprise cliente, limitée à ses salariés et
// portant son nom (comme RFC) — à lui transmettre ou à faire signer à part.
export async function GET(req: Request, { params }: { params: { sheetId: string } }) {
  const acces = await accessibleSheet(params.sheetId);
  if (!acces.ok) return NextResponse.json({ error: acces.error }, { status: acces.error === 'unauthenticated' ? 401 : 404 });

  const sb = supabaseServer();
  const vue = await loadSessionEmargement(sb, acces.value.session_id);
  const feuille = vue?.sheets.find((s) => s.id === params.sheetId);
  if (!vue || !feuille) return NextResponse.json({ error: 'attendance_sheet_not_found' }, { status: 404 });

  const companyId = new URL(req.url).searchParams.get('companyId');
  let companyName: string | null = null;
  let companyLearners: Set<string> | null = null;
  if (companyId) {
    const [{ data: company }, { data: links }] = await Promise.all([
      sb.schema('app').from('companies').select('name').eq('id', companyId).eq('organization_id', acces.value.organization_id).maybeSingle(),
      sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', acces.value.session_id),
    ]);
    if (!company) return NextResponse.json({ error: 'company_not_found' }, { status: 404 });
    companyName = (company as { name: string }).name;
    const ids = ((links ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id);
    const { data: dossiers } = ids.length
      ? await sb.schema('app').from('dossiers').select('learner_id').in('id', ids).eq('company_id', companyId)
      : { data: [] };
    companyLearners = new Set(((dossiers ?? []) as Array<{ learner_id: string }>).map((d) => d.learner_id));
  }

  const { data: org } = await sb.schema('app').from('organizations').select('name').eq('id', acces.value.organization_id).maybeSingle();
  const pdf = await renderPaperSheet({
    organizationName: (org as { name: string } | null)?.name ?? '',
    formationTitle: vue.session.title ?? 'Formation',
    companyName,
    slotLabel: `${jour(feuille.windowStart)} · ${HALF_DAY[feuille.halfDay] ?? 'Journée'} ${heure(feuille.windowStart)}–${heure(feuille.windowEnd)}`,
    learners: feuille.participants
      .filter((p) => p.kind === 'learner' && p.expected && (!companyLearners || companyLearners.has(p.id)))
      .map((p) => p.fullName),
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
