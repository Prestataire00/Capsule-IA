import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SessionLearnersTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { learners } = loaded;

  if (learners.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
        <EmptyState
          icon={Users}
          title="Aucun apprenant"
          description="Rattachez des apprenants à cette session depuis le dossier ou la formation."
        />
      </div>
    );
  }

  return (
    <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
      {learners.map((l) => (
        <li key={l.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
          <div className="min-w-0">
            <p className="text-zinc-900 dark:text-zinc-100">{l.first_name} {l.last_name}</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{l.email} · dossier {l.dossierReference}</p>
          </div>
          <Link
            href={`/dossiers/${l.dossierId}`}
            className="inline-flex items-center gap-1 text-[12px] text-violet-600 dark:text-violet-400 hover:underline shrink-0"
          >
            Dossier <ArrowUpRight className="w-3 h-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
