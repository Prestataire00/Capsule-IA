// ARCHETYPE: command
// Justification: centre de notifications in-app — lit app.notifications (RLS staff).

import Link from 'next/link';
import { Bell, AlertTriangle, FileSignature, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

type Notif = {
  id: string;
  channel: string;
  template_code: string;
  subject: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
  related_aggregate_type: string | null;
  related_aggregate_id: string | null;
};

const META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  attendance_signature_missing: { label: 'Émargement manquant', icon: FileSignature, tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' },
  dossier_hours_at_risk: { label: 'Dossier à risque (heures)', icon: Clock, tone: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30' },
};

function hrefFor(n: Notif): string | null {
  const p = n.payload ?? {};
  const dossierId = (p.dossier_id as string | undefined) ?? (n.related_aggregate_type === 'dossier' ? n.related_aggregate_id ?? undefined : undefined);
  if (dossierId) {
    if (n.template_code === 'attendance_signature_missing') return `/dossiers/${dossierId}/emargements`;
    if (n.template_code === 'dossier_hours_at_risk') return `/dossiers/${dossierId}/heures`;
    return `/dossiers/${dossierId}`;
  }
  return null;
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
            const meta = META[n.template_code] ?? { label: n.subject ?? n.template_code, icon: AlertTriangle, tone: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800' };
            const Icon = meta.icon;
            const href = hrefFor(n);
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
