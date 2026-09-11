// apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block.tsx
import { SheetGrid } from './sheet-grid';
import { ZoomImportPanel } from './zoom-import-panel';
import { FinalizeButton } from './finalize-button';
import { panelsForModality } from '@/features/attendance/domain/panels-for-modality';
import type { SheetView } from '@/features/attendance/queries/load-session-emargement';

const HALF_DAY_LABELS: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  full: 'Journée',
  evening: 'Soirée',
};

const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso));

export function HalfDaySheetBlock({
  sheet,
  sessionId,
  modality,
}: {
  sheet: SheetView;
  sessionId: string;
  modality: string;
}) {
  const panels = panelsForModality(modality);
  const attendus = sheet.participants.filter((p) => p.expected);
  const traites = attendus.filter((p) => p.state === 'complet' || p.state === 'absent' || p.state === 'excuse').length;
  const restants = attendus.length - traites;

  return (
    <section className="border border-zinc-200/60 dark:border-zinc-800 rounded-2xl p-4 space-y-3 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{HALF_DAY_LABELS[sheet.halfDay] ?? sheet.halfDay}</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            {heure(sheet.windowStart)}–{heure(sheet.windowEnd)} · entrée puis sortie, avec le même lien
          </p>
        </div>
        <span className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400">
          {traites}/{attendus.length} traité{attendus.length > 1 ? 's' : ''}
        </span>
      </header>

      <SheetGrid sheet={sheet} />
      {panels.zoom && !sheet.finalized && <ZoomImportPanel sheetId={sheet.id} sessionId={sessionId} />}

      <FinalizeButton sheetId={sheet.id} initialFinalized={sheet.finalized} initialDocumentId={sheet.documentId} ready={sheet.ready} remaining={restants} />
    </section>
  );
}
