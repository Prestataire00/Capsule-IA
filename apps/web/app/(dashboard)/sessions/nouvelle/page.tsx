// ARCHETYPE: workflow
// Justification: planifier une session de groupe sans passer par un dossier —
// on choisit la formation puis on réutilise le formulaire de session de groupe.

import Link from 'next/link';
import { ArrowLeft, CalendarClock, Plus } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { NewSessionPicker } from './new-session.client';

export const dynamic = 'force-dynamic';

export default async function NouvelleSessionPage() {
  await requireAccess('catalogue', 'manage');

  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, title')
    .is('deleted_at', null)
    .order('title', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formations = ((data as any[]) ?? []) as { id: string; title: string }[];

  return (
    <div className="max-w-2xl w-full mx-auto px-8 py-10">
      <Link
        href="/sessions"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux sessions
      </Link>

      <header className="mb-8 flex items-center gap-3">
        <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shadow-sm">
          <CalendarClock className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Planifier une session
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Une session de groupe rattachée à une formation — pas besoin de partir d&apos;un dossier.
          </p>
        </div>
      </header>

      {formations.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-10 text-center">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-3">
            Aucune formation au catalogue. Créez d&apos;abord une formation pour pouvoir planifier ses
            sessions.
          </p>
          <Link
            href="/formations/nouvelle"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" /> Nouvelle formation
          </Link>
        </div>
      ) : (
        <NewSessionPicker formations={formations} />
      )}
    </div>
  );
}
