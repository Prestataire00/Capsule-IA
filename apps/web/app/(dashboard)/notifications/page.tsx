// ARCHETYPE: command
// Justification: centre de notifications in-app — lit app.notifications (RLS staff), classées par période.

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { format, parseISO, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { NOTIF_META, NOTIF_FALLBACK, notifHref, type Notif } from './notif-meta';

export const dynamic = 'force-dynamic';

type GroupKey = 'today' | 'yesterday' | 'week' | 'older';

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'yesterday', label: 'Hier' },
  { key: 'week', label: '7 derniers jours' },
  { key: 'older', label: 'Plus ancien' },
];

function groupOf(iso: string): GroupKey {
  const d = parseISO(iso);
  if (isToday(d)) return 'today';
  if (isYesterday(d)) return 'yesterday';
  return differenceInCalendarDays(new Date(), d) < 7 ? 'week' : 'older';
}

function NotifRow({ n }: { n: Notif }) {
  const meta = NOTIF_META[n.template_code] ?? NOTIF_FALLBACK;
  const Icon = meta.icon;
  const href = notifHref(n);
  const row = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${meta.tone}`}>{meta.label}</span>
        </div>
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 mt-1">{n.subject ?? meta.label}</p>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-mono">
          {format(parseISO(n.created_at), 'dd/MM/yyyy HH:mm')}
        </p>
      </div>
    </div>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="block hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
          {row}
        </Link>
      ) : (
        row
      )}
    </li>
  );
}

export default async function NotificationsPage() {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('notifications')
    .select('id, channel, template_code, subject, payload, status, created_at, related_aggregate_type, related_aggregate_id')
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifs = ((data as any[]) ?? []) as Notif[];

  // Classement par période (les notifs sont déjà triées du plus récent au plus ancien).
  const byGroup = new Map<GroupKey, Notif[]>();
  for (const n of notifs) {
    const g = groupOf(n.created_at);
    (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(n);
  }

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-10">
      <header className="mb-8">
        <SectionLabel className="mb-2">Suivi</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Notifications</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          {notifs.length} notification{notifs.length > 1 ? 's' : ''} — alertes émargement, heures à risque, documents…
        </p>
      </header>

      {notifs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <EmptyState icon={Bell} title="Aucune notification" description="Les alertes (émargement manquant, dossiers à risque…) apparaîtront ici." />
        </div>
      ) : (
        <div className="space-y-6">
          {GROUPS.map(({ key, label }) => {
            const items = byGroup.get(key);
            if (!items || items.length === 0) return null;
            return (
              <section key={key}>
                <h2 className="text-[12px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium mb-2 flex items-center gap-2">
                  {label}
                  <span className="text-zinc-400 dark:text-zinc-600 font-normal normal-case tabular-nums">
                    · {items.length}
                  </span>
                </h2>
                <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
                  {items.map((n) => (
                    <NotifRow key={n.id} n={n} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
