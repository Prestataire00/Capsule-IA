// ARCHETYPE: command
// Justification: vue consolidée des feuilles d'émargement réelles du dossier (lecture seule).

import Link from 'next/link';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';

const HALF_DAY_LABELS: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full: 'Journée',
  evening: 'Soirée',
};

const fmtDateTime = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}` : '—';

export default async function EmargementsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  // Prod-safe : si attendance_sheets n'est pas migrée → data=null → liste vide.
  const { data } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select(
      'id, half_day, status, finalized_at, ' +
        'session:sessions(id, title, starts_at), ' +
        'signatures:attendance_signatures(signed_at)',
    )
    .eq('dossier_id', params.id);

  const sheets = (((data as unknown) as Record<string, unknown>[]) ?? [])
    .map((row) => {
      const session = row.session as { id: string; title: string | null; starts_at: string | null } | null;
      const sigs = (row.signatures as { signed_at: string | null }[] | null) ?? [];
      return {
        id: row.id as string,
        sessionId: session?.id ?? null,
        title: session?.title ?? 'Séance',
        startsAt: session?.starts_at ?? null,
        halfDay: (row.half_day as string | null) ?? 'full',
        finalized: row.finalized_at != null || row.status === 'finalized',
        total: sigs.length,
        signed: sigs.filter((g) => g.signed_at != null).length,
      };
    })
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? ''));

  const incomplete = sheets.filter((s) => !s.finalized && s.signed < s.total);

  return (
    <div className="space-y-4">
      <header>
        <SectionLabel className="mb-1">Émargements</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {sheets.length} feuille{sheets.length > 1 ? 's' : ''}
          {sheets.length > 0 && (
            <>
              {' · '}
              {incomplete.length === 0 ? (
                <span className="text-emerald-600">toutes complètes</span>
              ) : (
                <span className="text-amber-600">
                  {incomplete.length} incomplète{incomplete.length > 1 ? 's' : ''}
                </span>
              )}
            </>
          )}
        </p>
      </header>

      {incomplete.length > 0 && (
        <InfoCallout tone="warning">
          <p className="font-medium">
            {incomplete.length} feuille{incomplete.length > 1 ? 's' : ''} à finaliser.
          </p>
          <p className="text-[11px] mt-1">
            L&apos;émargement Qualiopi exige une signature par participant et par demi-journée. Le formateur peut le
            faire depuis son espace mobile.
          </p>
        </InfoCallout>
      )}

      {sheets.length === 0 ? (
        <div className="border border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl px-6 py-10 text-center">
          <p className="text-[14px] text-zinc-700 dark:text-zinc-300">
            Aucune feuille d&apos;émargement pour ce dossier.
          </p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
            Les feuilles sont générées automatiquement à la planification des séances (une par demi-journée).
          </p>
        </div>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {sheets.map((s) => {
            const ratio = s.total > 0 ? s.signed / s.total : 0;
            const tone = s.finalized || (s.total > 0 && ratio === 1) ? 'success' : s.total === 0 ? 'neutral' : 'warning';
            const label = s.finalized ? 'finalisée' : s.total === 0 ? 'à venir' : ratio === 1 ? 'complète' : 'incomplète';
            const inner = (
              <div className="grid grid-cols-[140px_1fr_120px_110px] gap-3 py-3 px-1 text-[13px] items-center">
                <span className="font-mono text-[11px] text-zinc-500">{fmtDateTime(s.startsAt)}</span>
                <span className="text-zinc-900 dark:text-zinc-100 truncate">
                  {s.title}
                  <span className="text-zinc-400 dark:text-zinc-500"> · {HALF_DAY_LABELS[s.halfDay] ?? s.halfDay}</span>
                </span>
                <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {s.signed}/{s.total} signé{s.total > 1 ? 's' : ''}
                </span>
                <StatusPill tone={tone}>{label}</StatusPill>
              </div>
            );
            return (
              <li key={s.id}>
                {s.sessionId ? (
                  <Link
                    href={`/dossiers/${params.id}/emargements/${s.sessionId}`}
                    className="block hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition rounded-lg"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
