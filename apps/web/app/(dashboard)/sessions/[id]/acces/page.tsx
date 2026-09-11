import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KeyRound, ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { AccessSend } from './access-send.client';

export const dynamic = 'force-dynamic';

export default async function SessionAccessTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { learners } = loaded;

  if (learners.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
        <EmptyState icon={KeyRound} title="Aucun apprenant" description="Rattachez des apprenants pour gérer leurs accès." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Accès des apprenants à leur espace de formation. Générez et envoyez les liens à toute la session en une fois,
        ou gérez/révoquez un accès depuis le dossier de l'apprenant.
      </p>
      <AccessSend sessionId={params.id} learnerCount={learners.length} />
      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {learners.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-zinc-900 dark:text-zinc-100">{l.first_name} {l.last_name}</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{l.email}</p>
              </div>
            </div>
            <Link
              href={`/dossiers/${l.dossierId}/acces-apprenant`}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition shrink-0"
            >
              Gérer l'accès <ArrowUpRight className="w-3 h-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
