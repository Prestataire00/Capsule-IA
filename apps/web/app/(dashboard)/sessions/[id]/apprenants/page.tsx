import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, Building2, User, Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession, type SessionLearner } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';

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
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
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
          className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden"
        >
          <header
            className={`px-5 py-2.5 border-b flex items-center gap-2.5 flex-wrap text-[12px] text-zinc-500 dark:text-zinc-400 bg-gradient-to-br ${
              g.company
                ? 'from-blue-50 to-white border-blue-100 dark:from-blue-950/40 dark:to-zinc-900 dark:border-blue-900/40'
                : 'from-rose-50 to-white border-rose-100 dark:from-rose-950/40 dark:to-zinc-900 dark:border-rose-900/40'
            }`}
          >
            <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${g.company ? ACCENTS.blue.soft : ACCENTS.rose.soft}`}>
              {g.company ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </span>
            <span className="font-bold text-[13px] text-zinc-900 dark:text-zinc-100">{g.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.rose.soft}`}>
              {g.learners.length} stagiaire{g.learners.length > 1 ? 's' : ''}
            </span>
            <span>
              {g.company ? 'une convention et un devis pour l’entreprise' : 'un contrat et un devis chacun'}
            </span>
          </header>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {g.learners.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="min-w-0 flex items-center gap-3">
                  <Avatar name={`${l.first_name} ${l.last_name}`} />
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100">
                      {l.first_name} {l.last_name}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                      {l.email} · dossier <span className="font-mono">{l.dossierReference}</span>
                    </p>
                  </div>
                </div>
                <Link
                  href={`/dossiers/${l.dossierId}`}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition shrink-0"
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

const AVATAR_PALETTE = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

/** Initiales sur une couleur tirée du nom. */
function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  const hash = Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${AVATAR_PALETTE[hash % AVATAR_PALETTE.length]}`}>
      {initials}
    </span>
  );
}
