import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Activity, Mail } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { EmptyState } from '@/shared/ui/empty-state';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

type EmailLogRow = {
  id: string;
  kind: string | null;
  recipient: string;
  subject: string | null;
  status: 'sent' | 'failed';
  sent_at: string;
};

export default async function SessionActivityTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { dossierIds } = loaded;

  let rows: EmailLogRow[] = [];
  if (dossierIds.length) {
    const { data } = await sb
      .schema('app')
      .from('email_log' as never)
      .select('id, kind, recipient, subject, status, sent_at')
      .in('dossier_id', dossierIds)
      .order('sent_at', { ascending: false })
      .limit(100);
    rows = (data as unknown as EmailLogRow[] | null) ?? [];
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
        <EmptyState
          icon={Activity}
          title="Aucune activité"
          description="Les emails envoyés aux apprenants de cette session (convocations, documents, questionnaires…) apparaîtront ici."
        />
      </div>
    );
  }

  return (
    <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
          <Mail className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.subject ?? '—'}</p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{r.recipient}</p>
          </div>
          <span className="tabular-nums text-[12px] text-zinc-500 dark:text-zinc-400 shrink-0">
            {format(parseISO(r.sent_at), 'dd MMM HH:mm', { locale: fr })}
          </span>
          <StatusPill tone={r.status === 'sent' ? 'success' : 'danger'}>
            {r.status === 'sent' ? 'envoyé' : 'échec'}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}
