// apps/web/app/(formateur)/emarger/[id]/page.tsx
// ARCHETYPE: command (mobile-first) — feuille d'émargement live du formateur.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { LiveRefresh, emargementEnCours } from '@/features/attendance/live-refresh';
import { ensureSessionSheets } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions';
import { HalfDaySheetBlock } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block';

export const dynamic = 'force-dynamic';

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

export default async function FormateurEmargerPage({ params }: { params: { id: string } }) {
  await ensureSessionSheets(params.id);
  const view = await loadSessionEmargement(supabaseServer(), params.id);
  if (!view) notFound();
  const { session, sheets } = view;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link href="/mes-sessions" className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5">
        <ArrowLeft className="w-3 h-3" /> Mes sessions
      </Link>

      <header>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {session.title ?? 'Séance'}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {format(parseISO(session.startsAt), 'EEEE d MMMM', { locale: fr })} ·{' '}
          {format(parseISO(session.startsAt), 'HH:mm', { locale: fr })}–
          {format(parseISO(session.endsAt), 'HH:mm', { locale: fr })} ·{' '}
          {MODALITY_LABELS[session.modality] ?? session.modality}
          {session.location ? ` · ${session.location}` : ''}
        </p>
      </header>

      {sheets.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune feuille pour cette séance.</p>
      ) : (
        <div className="space-y-5">
          {sheets.map((sheet) => (
            <HalfDaySheetBlock key={sheet.id} sheet={sheet} sessionId={session.id} modality={session.modality} />
          ))}
        </div>
      )}
      {emargementEnCours(sheets) && <LiveRefresh />}
    </div>
  );
}
