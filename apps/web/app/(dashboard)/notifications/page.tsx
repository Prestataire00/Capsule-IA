// ARCHETYPE: command
// Justification: centre de notifications in-app — lit app.notifications (RLS staff), classées par période.

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { format, parseISO, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { NOTIF_META, NOTIF_FALLBACK, notifHref, type Notif } from './notif-meta';
import { NotifItem } from './notif-item.client';

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
  return (
    <NotifItem id={n.id} href={href}>
      <div className="flex items-start gap-3 px-5 py-3.5">
        <span className={`w-9 h-9 rounded-lg grid place-items-center flex-shrink-0 ${meta.tone}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{n.subject ?? meta.label}</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 tabular-nums">
            {format(parseISO(n.created_at), 'dd/MM/yyyy HH:mm')}
          </p>
        </div>
        <span className={`flex-shrink-0 text-[12px] font-semibold h-6 px-2.5 rounded-full inline-flex items-center whitespace-nowrap ${meta.tone}`}>
          {meta.label}
        </span>
      </div>
    </NotifItem>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`text-[12px] h-8 px-3 rounded-full border transition inline-flex items-center gap-1.5 ${
        active
          ? 'bg-orange-500 border-orange-500 text-white font-bold'
          : 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-medium hover:border-zinc-300 dark:hover:border-zinc-700'
      }`}
    >
      {label}
      <span
        className={`tabular-nums text-[11px] font-bold px-1.5 rounded-full ${
          active ? 'bg-white/20 text-white' : tone ?? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('notifications')
    .select('id, channel, template_code, subject, payload, status, created_at, related_aggregate_type, related_aggregate_id')
    .eq('channel', 'in_app')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notifs = ((data as any[]) ?? []) as Notif[];

  // Catégories présentes (template_code) + compteurs, pour le filtre.
  const counts = new Map<string, number>();
  for (const n of notifs) counts.set(n.template_code, (counts.get(n.template_code) ?? 0) + 1);
  const categories = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);

  const selectedType = searchParams?.type && counts.has(searchParams.type) ? searchParams.type : null;
  const filtered = selectedType ? notifs.filter((n) => n.template_code === selectedType) : notifs;

  // Classement par période (déjà triées du plus récent au plus ancien).
  const byGroup = new Map<GroupKey, Notif[]>();
  for (const n of filtered) {
    const g = groupOf(n.created_at);
    (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(n);
  }

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Suivi</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Notifications</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
          {notifs.length} notification{notifs.length > 1 ? 's' : ''} non lue{notifs.length > 1 ? 's' : ''} — cliquez pour ouvrir et retirer de la liste.
        </p>
      </header>

      {notifs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm">
          <EmptyState icon={Bell} title="Vous êtes à jour" description="Aucune notification non lue. Les nouvelles alertes (émargement manquant, dossiers à risque, documents…) apparaîtront ici." />
        </div>
      ) : (
        <>
          {/* Filtre par catégorie */}
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-6">
              <FilterChip href="/notifications" active={!selectedType} label="Toutes" count={notifs.length} />
              {categories.map((code) => {
                const meta = NOTIF_META[code] ?? NOTIF_FALLBACK;
                return (
                  <FilterChip
                    key={code}
                    href={`/notifications?type=${encodeURIComponent(code)}`}
                    active={selectedType === code}
                    label={meta.label}
                    count={counts.get(code)!}
                    tone={meta.tone}
                  />
                );
              })}
            </div>
          )}
        <div className="space-y-6">
          {GROUPS.map(({ key, label }) => {
            const items = byGroup.get(key);
            if (!items || items.length === 0) return null;
            return (
              <section key={key}>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-2">
                  {label}
                  <span className="font-bold normal-case tracking-normal tabular-nums text-[12px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                    {items.length}
                  </span>
                </h2>
                <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
                  {items.map((n) => (
                    <NotifRow key={n.id} n={n} />
                  ))}
                </ul>
              </section>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}
