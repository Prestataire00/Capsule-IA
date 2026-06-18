// apps/web/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block.tsx
import { ParticipantsList } from './participants-list';
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
  const signedCount = sheet.participants.filter((p) => p.signed).length;

  return (
    <section className="border border-zinc-200/60 dark:border-zinc-800 rounded-2xl p-4 space-y-3 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
          {HALF_DAY_LABELS[sheet.halfDay] ?? sheet.halfDay}
        </h2>
        <span className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400">
          {signedCount}/{sheet.participants.length} signé{sheet.participants.length > 1 ? 's' : ''}
        </span>
      </header>

      {panels.signature && <ParticipantsList sheetId={sheet.id} participants={sheet.participants} />}
      {panels.zoom && <ZoomImportPanel sheetId={sheet.id} sessionId={sessionId} />}

      <FinalizeButton
        sheetId={sheet.id}
        initialFinalized={sheet.finalized}
        initialDocumentId={sheet.documentId}
        allSigned={sheet.allSigned}
      />
    </section>
  );
}
