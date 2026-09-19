// ARCHETYPE: command
// Justification: émargement d'une séance façon RFC — grille participants × demi-journées, puis le détail
// de chaque demi-journée (clôture, justificatifs, import Zoom, liens personnels).
import { notFound } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { EmptyState } from '@/shared/ui/empty-state';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { LiveRefresh } from '@/features/attendance/live-refresh';
import { emargementEnCours } from '@/features/attendance/live-window';
import { ensureSessionSheets } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions';
import { HalfDaySheetBlock } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/half-day-sheet-block';
import { AttendanceMatrix } from './attendance-matrix';

export const dynamic = 'force-dynamic';

export default async function SessionAttendanceTab({ params }: { params: { id: string } }) {
  // Rôles qui ont accès à l'émargement ; les URL signées ci-dessous passent par le service role.
  await requireAccess('attendance');
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

  // Miniatures des signatures et PDF des feuilles clôturées (seaux privés,
  // URL signées de dix minutes) — pour la séance déjà lue sous RLS.
  const admin = supabaseAdmin();
  const chemins: { cle: string; chemin: string }[] = [];
  for (const s of view.sheets) {
    for (const p of s.participants) {
      if (p.signatureImagePath) chemins.push({ cle: `${s.id}|${p.kind}:${p.id}|entry`, chemin: p.signatureImagePath });
    }
  }
  const vignettes: Record<string, string> = {};
  if (chemins.length) {
    const { data } = await admin.storage.from('signatures').createSignedUrls(chemins.map((c) => c.chemin), 600);
    const parChemin = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
    for (const c of chemins) {
      const url = parChemin.get(c.chemin);
      if (url) vignettes[c.cle] = url;
    }
  }
  const pdfs: Record<string, string> = {};
  const docIds = view.sheets.map((s) => s.documentId).filter((x): x is string => Boolean(x));
  if (docIds.length) {
    const { data: docs } = await admin.schema('app').from('documents').select('id, storage_path').in('id', docIds);
    const lignes = ((docs ?? []) as { id: string; storage_path: string | null }[]).filter((d) => d.storage_path);
    if (lignes.length) {
      const { data } = await admin.storage.from('documents').createSignedUrls(lignes.map((d) => d.storage_path as string), 600);
      const parChemin = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
      for (const s of view.sheets) {
        const doc = lignes.find((d) => d.id === s.documentId);
        const url = doc ? parChemin.get(doc.storage_path as string) : undefined;
        if (url) pdfs[s.id] = url;
      }
    }
  }

  return (
    <div className="space-y-6">
      <AttendanceMatrix sheets={view.sheets} vignettes={vignettes} pdfs={pdfs} csvHref={`/api/emargements/export.csv?sessionId=${view.session.id}`} />

      <details className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <summary className="cursor-pointer px-5 py-3.5 text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
          Détail par demi-journée — clôture, justificatifs, import Zoom, liens personnels
        </summary>
        <div className="px-5 pb-5 space-y-5">
          {view.sheets.map((sheet) => (
            <HalfDaySheetBlock key={sheet.id} sheet={sheet} sessionId={view.session.id} modality={view.session.modality} />
          ))}
        </div>
      </details>

      {emargementEnCours(view.sheets) && <LiveRefresh />}
    </div>
  );
}
