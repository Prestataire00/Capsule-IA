import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, User as UserIcon, Mail, MessageSquareText, History } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ReplyForm } from './reply-form';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

export const dynamic = 'force-dynamic';

type ComplaintRow = {
  id: string;
  reference: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reporter_name: string | null;
  reporter_email: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  metadata: Record<string, unknown>;
  organization_id: string;
};

type EventRow = {
  id: string;
  kind: 'comment' | 'status_change' | 'assignment' | 'resolution';
  payload: Record<string, unknown>;
  occurred_at: string;
};

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const statusConfig = {
  open: { label: 'Ouverte', tone: 'info' },
  in_progress: { label: 'En cours', tone: 'warning' },
  resolved: { label: 'Résolue', tone: 'success' },
  closed: { label: 'Clôturée', tone: 'neutral' },
} as const;

export default async function ReclamationDetailPage({ params }: { params: { id: string } }) {
  await requireAccess('qualiopi');
  const me = await getCurrentMember();
  if (!me) notFound();

  const sb = admin();
  const [{ data: cData }, { data: eData }] = await Promise.all([
    sb.schema('app').from('complaints').select('*').eq('id', params.id).eq('organization_id', me.organizationId).maybeSingle(),
    sb.schema('app').from('complaint_events').select('*').eq('complaint_id', params.id).eq('organization_id', me.organizationId).order('occurred_at', { ascending: true }),
  ]);

  if (!cData) return notFound();
  const complaint = cData as unknown as ComplaintRow;
  const events = (eData ?? []) as unknown as EventRow[];

  const cfg = statusConfig[complaint.status];
  const category = (complaint.metadata?.category_label as string) ?? (complaint.metadata?.category as string) ?? 'Autre';

  return (
    <div className="max-w-3xl mx-auto px-8 py-9">
      <Link
        href="/reclamations"
        className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Toutes les réclamations
      </Link>

      <header className="mb-7">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <IdPill>{complaint.reference}</IdPill>
          <StatusPill tone={cfg.tone}>{cfg.label}</StatusPill>
        </div>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">{complaint.subject}</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 flex items-center gap-2 flex-wrap tabular-nums">
          <span>{category}</span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span>Reçue le {new Date(complaint.created_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</span>
          {complaint.reporter_name && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <span className="inline-flex items-center gap-1">
                <UserIcon className="w-3 h-3" />
                {complaint.reporter_name}
              </span>
            </>
          )}
          {complaint.reporter_email && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">·</span>
              <a href={`mailto:${complaint.reporter_email}`} className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400 hover:underline">
                <Mail className="w-3 h-3" />
                {complaint.reporter_email}
              </a>
            </>
          )}
        </p>
      </header>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-3 flex items-center gap-2">
          <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.rose.soft}`}>
            <MessageSquareText className="w-3.5 h-3.5" />
          </span>
          Demande de l&apos;apprenant
        </p>
        <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{complaint.description}</p>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-4 tabular-nums flex items-center gap-2">
          <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
            <History className="w-3.5 h-3.5" />
          </span>
          Suivi
          <span className={`normal-case tracking-normal text-[12px] font-bold px-2 py-0.5 rounded-full ${ACCENTS.blue.soft}`}>
            {events.length} événement{events.length > 1 ? 's' : ''}
          </span>
        </p>
        {events.length === 0 ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 italic">Aucun événement enregistré. Répondez ci-dessous pour démarrer le suivi.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((ev, i) => {
              const isLast = i === events.length - 1;
              const payload = ev.payload as { by?: string; text?: string; from_learner?: boolean; to?: string };
              const isFromLearner = payload.from_learner === true;
              const dotColor =
                ev.kind === 'resolution' ? 'bg-emerald-500'
                : ev.kind === 'status_change' ? 'bg-orange-500'
                : isFromLearner ? 'bg-rose-500'
                : 'bg-zinc-400';
              return (
                <li key={ev.id} className="flex gap-3 relative">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor} ring-2 ring-white dark:ring-zinc-900 z-10 mt-1`} />
                    {!isLast && <span className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 mt-0.5" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`text-[13px] font-bold ${isFromLearner ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        {payload.by ?? 'Système'}
                      </span>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {new Date(ev.occurred_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[13px] text-zinc-700 dark:text-zinc-300 mt-0.5 leading-snug whitespace-pre-wrap">
                      {payload.text ?? (payload.to ? `Statut → ${payload.to}` : ev.kind)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <ReplyForm
        complaintId={complaint.id}
        currentStatus={complaint.status}
      />
    </div>
  );
}
