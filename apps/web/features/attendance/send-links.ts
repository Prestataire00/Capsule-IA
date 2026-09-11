import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { emargementLinkEmail } from '@/shared/lib/email/templates';
import { halfDayWindow, type HalfDay } from './half-day-window';
import { issueAttendanceLink } from './issue-attendance-link';
import { participantState, type AttendanceStatus } from './completeness';
import { linkRecipients, type LinkCandidate, type LinkMode } from './link-recipients';

/**
 * Envoie à chaque apprenant attendu son lien personnel d'émargement pour une
 * feuille. Chaque envoi est journalisé avec la feuille (métadonnée), ce qui
 * permet à l'envoi automatique de ne jamais écrire deux fois à la même
 * personne pour la même demi-journée.
 */

export type SendLinksResult = { sent: number; ignored: number; withoutEmail: string[]; failed: string[] };

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const PARIS = 'Europe/Paris';
const hhmm = (d: Date) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(d);
const jour = (d: Date) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: PARIS }).format(d);

export async function sendSheetLinks(sheetId: string, mode: LinkMode, baseUrl: string): Promise<SendLinksResult> {
  const vide: SendLinksResult = { sent: 0, ignored: 0, withoutEmail: [], failed: [] };
  const sb = supabaseAdmin();

  const { data: sheetData } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, organization_id, session_id, half_day, status, session:sessions(starts_at, ends_at, title, dossier_id, formation_id)')
    .eq('id', sheetId)
    .maybeSingle();
  type SessionLite = { starts_at: string; ends_at: string; title: string | null; dossier_id: string | null; formation_id: string | null };
  const sheet = sheetData as unknown as {
    id: string;
    organization_id: string;
    session_id: string;
    half_day: HalfDay | null;
    status: string;
    session: SessionLite | SessionLite[] | null;
  } | null;
  const session = Array.isArray(sheet?.session) ? sheet?.session[0] : sheet?.session;
  if (!sheet || !session || sheet.status === 'finalized') return vide;

  const { data: attendus } = await sb.schema('app').rpc('session_expected_signers' as never, { p_session_id: sheet.session_id } as never);
  const learnerIds = ((attendus ?? []) as { participant_kind: string; participant_id: string }[])
    .filter((e) => e.participant_kind === 'learner')
    .map((e) => e.participant_id);
  if (learnerIds.length === 0) return vide;

  const [{ data: learners }, { data: sigs }, { data: sd }] = await Promise.all([
    sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds),
    sb
      .schema('app')
      .from('attendance_signatures')
      .select('learner_id, status, signed_at, exit_signed_at, capture_mode, evidence_source, early_departure_time')
      .eq('attendance_sheet_id', sheetId)
      .eq('participant_kind', 'learner'),
    sb.schema('app').from('session_dossiers' as never).select('dossier_id').eq('session_id' as never, sheet.session_id as never),
  ]);

  // Dossier de chaque apprenant dans cette séance (journal d'envoi), et titre de la formation.
  const dossierIds = [...new Set([session.dossier_id, ...((sd ?? []) as { dossier_id: string }[]).map((r) => r.dossier_id)].filter(Boolean))] as string[];
  const { data: dossiers } = dossierIds.length
    ? await sb.schema('app').from('dossiers').select('id, learner_id, formation_id').in('id', dossierIds)
    : { data: [] };
  const dossierDe = new Map<string, string>();
  let formationId = session.formation_id;
  for (const d of (dossiers ?? []) as { id: string; learner_id: string | null; formation_id: string | null }[]) {
    if (d.learner_id && !dossierDe.has(d.learner_id)) dossierDe.set(d.learner_id, d.id);
    formationId ??= d.formation_id;
  }
  const { data: formation } = formationId
    ? await sb.schema('app').from('formations').select('title').eq('id', formationId).maybeSingle()
    : { data: null };
  const formationTitle = (formation as { title: string } | null)?.title ?? session.title ?? 'votre formation';

  type Sig = { learner_id: string; status: AttendanceStatus; signed_at: string | null; exit_signed_at: string | null; capture_mode: string | null; evidence_source: string | null; early_departure_time: string | null };
  const sigDe = new Map<string, Sig>();
  for (const g of (sigs ?? []) as unknown as Sig[]) sigDe.set(g.learner_id, g);

  const candidats: LinkCandidate[] = ((learners ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).map((l) => {
    const g = sigDe.get(l.id);
    return {
      id: l.id,
      name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Apprenant',
      email: l.email,
      state: participantState(
        'learner',
        g
          ? {
              status: g.status,
              signedAt: g.signed_at,
              exitSignedAt: g.exit_signed_at,
              captureMode: g.capture_mode,
              evidenceSource: g.evidence_source,
              earlyDeparture: g.early_departure_time,
            }
          : null,
      ),
    };
  });

  const dejaEnvoyes = new Set<string>();
  if (mode === 'auto') {
    const { data: logs } = await sb
      .schema('app')
      .from('email_log' as never)
      .select('recipient')
      .eq('kind' as never, 'emargement_lien' as never)
      .eq('status' as never, 'sent' as never)
      .eq('metadata->>attendance_sheet_id' as never, sheetId as never);
    for (const l of (logs ?? []) as { recipient: string }[]) dejaEnvoyes.add(l.recipient.trim().toLowerCase());
  }

  const { envoyer, ignores, sansEmail } = linkRecipients(candidats, mode, dejaEnvoyes);
  const halfDay: HalfDay = sheet.half_day ?? 'full';
  const fenetre = halfDayWindow(new Date(session.starts_at), new Date(session.ends_at), halfDay);
  const resultat: SendLinksResult = { sent: 0, ignored: ignores, withoutEmail: sansEmail, failed: [] };

  for (const c of envoyer) {
    const lien = await issueAttendanceLink({ sheetId, signerId: c.id, signerKind: 'learner', baseUrl });
    if (!lien.ok) {
      resultat.failed.push(c.name);
      continue;
    }
    const tpl = emargementLinkEmail({
      firstName: c.name.split(' ')[0] ?? c.name,
      formationTitle,
      dateLabel: jour(fenetre.start),
      halfDayLabel: HALF_DAY[halfDay] ?? 'Journée',
      start: hhmm(fenetre.start),
      end: hhmm(fenetre.end),
      url: lien.link.url,
    });
    const r = await sendEmail({
      to: c.email!.trim(),
      subject: tpl.subject,
      html: tpl.html,
      organizationId: sheet.organization_id,
      dossierId: dossierDe.get(c.id),
      kind: 'emargement_lien',
      metadata: { attendance_sheet_id: sheetId, mode },
    });
    if (r.ok) resultat.sent++;
    else resultat.failed.push(c.name);
  }
  return resultat;
}
