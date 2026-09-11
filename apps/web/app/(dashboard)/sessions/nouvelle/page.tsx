// ARCHETYPE: workflow
// Justification: planifier une session de groupe sans passer par un dossier —
// on choisit la formation puis on réutilise le formulaire de session de groupe.

import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { SectionLabel } from '@/shared/ui/section-label';
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
    <div className="max-w-2xl w-full mx-auto px-8 py-9">
      <Link
        href="/sessions"
        className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux sessions
      </Link>

      <header className="mb-7">
        <SectionLabel className="mb-2">Planification</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
          Planifier une session
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Une session de groupe rattachée à une formation — pas besoin de partir d&apos;un dossier.
        </p>
      </header>

      {formations.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-10 text-center">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
            Aucune formation au catalogue. Créez d&apos;abord une formation pour pouvoir planifier ses
            sessions.
          </p>
          <Link
            href="/formations/nouvelle"
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
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
