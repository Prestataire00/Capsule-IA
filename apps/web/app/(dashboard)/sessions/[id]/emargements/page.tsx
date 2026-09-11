// ARCHETYPE: command
// Justification: émargement d'une séance — une grille par demi-journée (entrée, sortie, statut),
// liens, QR, tablette, marquage et clôture. Seul accès pour les sessions de groupe (sans dossier).
import { notFound } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { EmptyState } from '@/shared/ui/empty-state';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { ensureSessionSheets } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions';
import { HalfDaySheetBlock } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block';

export const dynamic = 'force-dynamic';

export default async function SessionAttendanceTab({ params }: { params: { id: string } }) {
  // Idempotent : garantit les feuilles matin / après-midi de la séance.
  await ensureSessionSheets(params.id);
  const view = await loadSessionEmargement(supabaseServer(), params.id);
  if (!view) notFound();

  if (view.sheets.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
        <EmptyState
          icon={ClipboardCheck}
          title="Aucune feuille d'émargement"
          description="Les feuilles (matin / après-midi) sont générées automatiquement à partir des horaires de la session."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Chaque apprenant signe à l’arrivée puis à la fin de chaque demi-journée, avec son lien personnel (e-mail, QR imprimé) ou sur
        la tablette de l’organisme. Marquez ici les absences, retards et départs anticipés.
      </p>
      {view.sheets.map((sheet) => (
        <HalfDaySheetBlock key={sheet.id} sheet={sheet} sessionId={view.session.id} modality={view.session.modality} />
      ))}
    </div>
  );
}
