import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Inbox, Hourglass, CheckCircle2, XCircle, User as UserIcon, Mail } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ReplyForm } from './reply-form';
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
  open: { label: 'Ouverte', icon: Inbox, tone: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' },
  in_progress: { label: 'En cours', icon: Hourglass, tone: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
  resolved: { label: 'Résolue', icon: CheckCircle2, tone: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
  closed: { label: 'Clôturée', icon: XCircle, tone: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400' },
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
  const StatusIcon = cfg.icon;
  const category = (complaint.metadata?.category_label as string) ?? (complaint.metadata?.category as string) ?? 'Autre';

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link
        href="/reclamations"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Toutes les réclamations
      </Link>

      <header className="mb-6">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
          <p className="font-mono text-[12px] text-zinc-400">{complaint.reference}</p>
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${cfg.tone}`}>
            <StatusIcon className="w-3 h-3" />
            {cfg.label}
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {complaint.subject}
        </h1>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2 flex items-center gap-2 flex-wrap">
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
              <a href={`mailto:${complaint.reporter_email}`} className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline">
                <Mail className="w-3 h-3" />
                {complaint.reporter_email}
              </a>
            </>
          )}
        </p>
      </header>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm mb-6">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-2">Demande de l&apos;apprenant</p>
        <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{complaint.description}</p>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm mb-6">
        <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-4">Suivi · {events.length} événement{events.length > 1 ? 's' : ''}</p>
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
                : ev.kind === 'status_change' ? 'bg-violet-500'
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
                      <span className={`text-[12px] font-medium ${isFromLearner ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        {payload.by ?? 'Système'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {new Date(ev.occurred_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug whitespace-pre-wrap">
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
