// ARCHETYPE: command
// Justification: émargements d'un apprenant (dossier), séance par séance et demi-journée par
// demi-journée — sessions de groupe comprises — avec son entrée, sa sortie et son état.

import Link from 'next/link';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { participantState, STATE_LABELS, type AttendanceStatus, type ParticipantState } from '@/features/attendance/completeness';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { loadGrilleDossier } from '@/features/attendance/queries/load-dossier-grille';
import { GrilleEmargement } from './grille.client';

export const dynamic = 'force-dynamic';

const HALF_DAY_LABELS: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const TON: Record<ParticipantState, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  complet: 'success',
  entree_seule: 'info',
  a_signer: 'warning',
  absent: 'danger',
  excuse: 'neutral',
};
const PARIS = 'Europe/Paris';
const jour = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: PARIS }).format(new Date(iso)) : '—';
const heure = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(new Date(iso)) : '—';

type Sig = {
  learner_id: string | null;
  status: AttendanceStatus;
  signed_at: string | null;
  exit_signed_at: string | null;
  capture_mode: string | null;
  evidence_source: string | null;
  early_departure_time: string | null;
};
type SheetRow = {
  id: string;
  half_day: string | null;
  status: string;
  session: { id: string; title: string | null; starts_at: string | null } | null;
  signatures: Sig[] | null;
};

export default async function EmargementsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossierData } = await sb.schema('app').from('dossiers').select('learner_id').eq('id', params.id).maybeSingle();
  const learnerId = (dossierData as { learner_id: string | null } | null)?.learner_id ?? null;

  // Séances du dossier : lien direct et sessions de groupe.
  const [{ data: directes }, { data: groupes }] = await Promise.all([
    sb.schema('app').from('sessions').select('id').eq('dossier_id', params.id),
    sb.schema('app').from('session_dossiers' as never).select('session_id').eq('dossier_id' as never, params.id as never),
  ]);
  const seances = [
    ...new Set([
      ...((directes ?? []) as { id: string }[]).map((s) => s.id),
      ...((groupes ?? []) as { session_id: string }[]).map((s) => s.session_id),
    ]),
  ];

  const { data } = seances.length
    ? await sb
        .schema('app')
        .from('attendance_sheets')
        .select(
          'id, half_day, status, session:sessions(id, title, starts_at), signatures:attendance_signatures(learner_id, status, signed_at, exit_signed_at, capture_mode, evidence_source, early_departure_time)',
        )
        .in('session_id', seances)
    : { data: [] };

  const lignes = ((data ?? []) as unknown as SheetRow[])
    .map((row) => {
      const g = (row.signatures ?? []).find((s) => s.learner_id === learnerId) ?? null;
      const state = participantState(
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
      );
      return {
        id: row.id,
        sessionId: row.session?.id ?? null,
        title: row.session?.title ?? 'Séance',
        startsAt: row.session?.starts_at ?? null,
        halfDay: row.half_day ?? 'full',
        finalized: row.status === 'finalized',
        entree: g?.signed_at ?? null,
        sortie: g?.exit_signed_at ?? null,
        state,
      };
    })
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.halfDay.localeCompare(b.halfDay));

  const aSigner = lignes.filter((l) => !l.finalized && (l.state === 'a_signer' || l.state === 'entree_seule')).length;

  // Grille du dossier : les demi-journées en colonnes, les stagiaires en
  // lignes. La liste qui suit reste utile pour l'état de chaque feuille.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grille = await loadGrilleDossier(sb as any, params.id);
  const peutAgir = await canManageSection('attendance');

  return (
    <div className="space-y-4">
      <header>
        <SectionLabel className="mb-1">Émargements</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {lignes.length} demi-journée{lignes.length > 1 ? 's' : ''}
          {lignes.length > 0 && (
            <>
              {' · '}
              {aSigner === 0 ? (
                <span className="text-emerald-600">rien en attente</span>
              ) : (
                <span className="text-amber-600">{aSigner} en attente de signature</span>
              )}
            </>
          )}
        </p>
      </header>

      <GrilleEmargement
        dossierId={params.id}
        colonnes={grille.colonnes}
        lignes={grille.lignes}
        vignettes={grille.vignettes}
        formateurs={grille.formateurs}
        peutAgir={peutAgir}
      />

      <details className="group">
        <summary className="cursor-pointer text-[12px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
          État de chaque feuille
        </summary>
        <div className="mt-3">

      {lignes.length === 0 ? (
        <div className="border border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl px-6 py-10 text-center">
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300">Aucune feuille d&apos;émargement pour ce dossier.</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
            Les feuilles sont créées automatiquement à la planification des séances (une par demi-journée).
          </p>
        </div>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {lignes.map((l) => {
            const contenu = (
              <div className="grid grid-cols-[80px_1fr_auto] sm:grid-cols-[90px_1fr_110px_130px] gap-3 py-3 px-1 text-[13px] items-center">
                <span className="tabular-nums text-[11px] text-zinc-500">{jour(l.startsAt)}</span>
                <span className="text-zinc-900 dark:text-zinc-100 truncate">
                  {l.title}
                  <span className="text-zinc-400 dark:text-zinc-500"> · {HALF_DAY_LABELS[l.halfDay] ?? l.halfDay}</span>
                </span>
                <span className="hidden sm:block tabular-nums text-[11px] text-zinc-600 dark:text-zinc-300">
                  {heure(l.entree)} → {heure(l.sortie)}
                </span>
                <StatusPill tone={TON[l.state]}>{l.finalized ? `${STATE_LABELS[l.state]} · close` : STATE_LABELS[l.state]}</StatusPill>
              </div>
            );
            return (
              <li key={l.id}>
                {l.sessionId ? (
                  <Link href={`/sessions/${l.sessionId}/emargements`} className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition rounded-lg">
                    {contenu}
                  </Link>
                ) : (
                  contenu
                )}
              </li>
            );
          })}
        </ul>
      )}
        </div>
      </details>
    </div>
  );
}
