// ARCHETYPE: command
// Justification: centre de notifications in-app — lit app.notifications (RLS staff).

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';
import { NOTIF_META, NOTIF_FALLBACK, notifHref, type Notif } from './notif-meta';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-10">
      <header className="mb-8">
        <SectionLabel className="mb-2">Suivi</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Notifications</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          {notifs.length} notification{notifs.length > 1 ? 's' : ''} — alertes émargement, heures à risque…
        </p>
      </header>

      {notifs.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl">
          <EmptyState icon={Bell} title="Aucune notification" description="Les alertes (émargement manquant, dossiers à risque…) apparaîtront ici." />
        </div>
      ) : (
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
          {notifs.map((n) => {
            const meta = NOTIF_META[n.template_code] ?? NOTIF_FALLBACK;
            const Icon = meta.icon;
            const href = notifHref(n);
            const row = (
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{n.subject ?? meta.label}</p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-mono">
                    {format(parseISO(n.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className="block hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">{row}</Link>
                ) : row}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
