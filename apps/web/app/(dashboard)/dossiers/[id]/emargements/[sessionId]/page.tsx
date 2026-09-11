// ARCHETYPE: command
// Justification: feuille d'émargement réelle d'une séance — vue gestionnaire, une feuille par demi-journée.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { LiveRefresh } from '@/features/attendance/live-refresh';
import { emargementEnCours } from '@/features/attendance/live-window';
import { ensureSessionSheets } from './actions';
import { HalfDaySheetBlock } from './half-day-sheet-block';
import { GenerateSheetsButton } from './generate-sheets-button';

export const dynamic = 'force-dynamic';

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

export default async function EmargementSessionPage({
  params,
}: {
  params: { id: string; sessionId: string };
}) {
  // Idempotent : garantit l'existence des feuilles demi-journée (séances anciennes incluses).
  await ensureSessionSheets(params.sessionId);

  const view = await loadSessionEmargement(supabaseServer(), params.sessionId);
  if (!view) notFound();

  const { session, sheets } = view;
  const hasLegacyFull = sheets.length === 1 && sheets[0]?.halfDay === 'full';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={`/dossiers/${params.id}/emargements`}
        className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
      >
        ← Toutes les feuilles
      </Link>

      <header>
        <SectionLabel className="mb-1">Émargement</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {session.title ?? 'Séance'}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {format(parseISO(session.startsAt), 'EEEE d MMMM yyyy', { locale: fr })} ·{' '}
          {format(parseISO(session.startsAt), 'HH:mm', { locale: fr })}–
          {format(parseISO(session.endsAt), 'HH:mm', { locale: fr })} ·{' '}
          {MODALITY_LABELS[session.modality] ?? session.modality}
          {session.location ? ` · ${session.location}` : ''}
        </p>
      </header>

      {sheets.length === 0 ? (
        <div className="border border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl px-6 py-10 space-y-3">
          <p className="text-[14px] text-zinc-700 dark:text-zinc-300 text-center">
            Aucune feuille d&apos;émargement pour cette séance.
          </p>
          <GenerateSheetsButton sessionId={session.id} hasLegacyFull={false} />
        </div>
      ) : (
        <div className="space-y-5">
          {hasLegacyFull && (
            <div className="border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl px-4 py-3 space-y-2">
              <p className="text-[12px] text-amber-800 dark:text-amber-300">
                Feuille unique « journée » (ancien format). Vous pouvez la convertir en feuilles matin / après-midi
                (uniquement si aucune signature n&apos;a encore été posée).
              </p>
              <GenerateSheetsButton sessionId={session.id} hasLegacyFull />
            </div>
          )}
          {sheets.map((sheet) => (
            <HalfDaySheetBlock key={sheet.id} sheet={sheet} sessionId={session.id} modality={session.modality} />
          ))}
        </div>
      )}

      {emargementEnCours(sheets) && <LiveRefresh />}

      <p className="text-[11px] text-zinc-400">
        Les financeurs exigent une signature par participant et par demi-journée ; la feuille clôturée sert de preuve de présence.
      </p>
    </div>
  );
}
