// ARCHETYPE: command
// Justification: toutes les notifications adressées au formateur — validation
// d'un cours, réponse de la direction, alertes de son organisme.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bell } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { NOTIF_META, NOTIF_FALLBACK, type Notif } from '@/app/(dashboard)/notifications/notif-meta';
import { MarquerToutLu } from './marquer-tout-lu.client';

export const dynamic = 'force-dynamic';

const horodatage = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function MesNotificationsPage() {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) notFound();

  const { data } = await supabaseAdmin()
    .schema('app')
    .from('notifications')
    .select('id, template_code, subject, payload, created_at, related_aggregate_type, related_aggregate_id, read_at')
    .eq('recipient_user_id', user.id)
    .eq('channel', 'in_app')
    .order('created_at', { ascending: false })
    .limit(60);
  const notifications = ((data ?? []) as unknown as Notif[]) ?? [];
  const nonLues = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950 p-5 shadow-sm flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Notifications</h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5 tabular-nums">
            {nonLues === 0 ? 'Tout est lu.' : `${nonLues} non lue${nonLues > 1 ? 's' : ''}.`}
          </p>
        </div>
        {nonLues > 0 && <MarquerToutLu />}
      </header>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <Bell className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">Aucune notification pour l&apos;instant.</p>
        </div>
      ) : (
        <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
          {notifications.map((n) => {
            const meta = NOTIF_META[n.template_code] ?? NOTIF_FALLBACK;
            const Icone = meta.icon;
            const sessionId = typeof n.payload?.session_id === 'string' ? n.payload.session_id : null;
            const href = sessionId
              ? n.related_aggregate_type === 'session_resource'
                ? `/seance/${sessionId}/supports`
                : `/seance/${sessionId}`
              : null;

            const contenu = (
              <span className={`flex items-start gap-3 px-4 py-3.5 ${n.read_at ? 'opacity-60' : ''}`}>
                <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${meta.tone}`}>
                  <Icone className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{meta.label}</span>
                  {n.subject && (
                    <span className="block text-[13px] text-zinc-600 dark:text-zinc-400">{n.subject}</span>
                  )}
                  {typeof n.payload?.reason === 'string' && n.payload.reason && (
                    <span className="block text-[12px] text-red-600 dark:text-red-400 mt-0.5">
                      Motif : {n.payload.reason}
                    </span>
                  )}
                  <span className="block text-[11px] text-zinc-400 tabular-nums mt-0.5 capitalize">
                    {horodatage.format(new Date(n.created_at))}
                  </span>
                </span>
                {!n.read_at && <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" aria-label="Non lue" />}
              </span>
            );

            return <li key={n.id}>{href ? <Link href={href}>{contenu}</Link> : contenu}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
