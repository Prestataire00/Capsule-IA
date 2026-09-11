import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Building2, User, Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession, type SessionLearner } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

type ClientGroup = { key: string; label: string; company: boolean; learners: SessionLearner[] };

/** Stagiaires regroupés par client : une entreprise avec ses salariés, ou chaque particulier. */
function groupByClient(learners: SessionLearner[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const l of learners) {
    const key = l.companyId ? `c:${l.companyId}` : 'particuliers';
    const group = groups.get(key) ?? {
      key,
      label: l.companyId ? (l.companyName ?? 'Entreprise') : 'Particuliers',
      company: !!l.companyId,
      learners: [],
    };
    group.learners.push(l);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.company === b.company ? a.label.localeCompare(b.label, 'fr') : a.company ? -1 : 1,
  );
}

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
    <div className="space-y-4">
      {groupByClient(learners).map((g) => (
        <section
          key={g.key}
          className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden"
        >
          <header className="px-4 py-2.5 bg-zinc-50/60 dark:bg-zinc-900/40 flex items-center gap-2 text-[12px] text-zinc-600 dark:text-zinc-400">
            {g.company ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{g.label}</span>
            <span>
              · {g.learners.length} stagiaire{g.learners.length > 1 ? 's' : ''}
              {g.company ? ' · une convention et un devis pour l’entreprise' : ' · un contrat et un devis chacun'}
            </span>
          </header>
          <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {g.learners.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <div className="min-w-0">
                  <p className="text-zinc-900 dark:text-zinc-100">
                    {l.first_name} {l.last_name}
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                    {l.email} · dossier {l.dossierReference}
                  </p>
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
        </section>
      ))}
    </div>
  );
}
