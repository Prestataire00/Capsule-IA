// ARCHETYPE: command
// Justification: vue d'ensemble des questionnaires assignés (positionnement, satisfaction) avec NPS agrégé.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClipboardList, Star, Send } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { StatCard } from '@/shared/ui/stat-card';

export const dynamic = 'force-dynamic';

const labels: Record<string, string> = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  opco: 'OPCO',
  evaluation_acquis: 'Évaluation des acquis',
  custom: 'Personnalisé',
};

type AssignmentRow = {
  id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  due_at: string | null;
  created_at: string;
  dossier_id: string;
  template: { title: string; kind: string } | null;
  dossier: { reference: string } | null;
  response: { nps: number | null; submitted_at: string } | null;
};

export default async function QuestionnairesPage() {
  const sb = supabaseServer();

  // Assignations de questionnaires (RLS-scopé) + template, dossier et réponse éventuelle.
  const { data } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select(
      'id, recipient_name, recipient_email, status, due_at, created_at, dossier_id, ' +
        'template:questionnaire_templates(title, kind), ' +
        'dossier:dossiers(reference), ' +
        'response:questionnaire_responses(nps, submitted_at)',
    )
    .order('created_at', { ascending: false });
  const all = (data as unknown as AssignmentRow[] | null) ?? [];

  const completed = all.filter((q) => q.status === 'completed').length;
  const pending = all.filter((q) => q.status === 'pending' || q.status === 'in_progress').length;
  const npsValues = all
    .map((q) => q.response?.nps)
    .filter((n): n is number => typeof n === 'number');
  const npsAvg = npsValues.length
    ? (npsValues.reduce((s, n) => s + n, 0) / npsValues.length).toFixed(1)
    : '—';

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Questionnaires</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Positionnement, satisfaction à chaud et à froid — preuves Qualiopi I10, I26, I27.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Questionnaires assignés" value={all.length} icon={ClipboardList} accent="blue" />
        <StatCard label="Complétés" value={completed} icon={ClipboardList} accent="emerald" hint={`${Math.round((completed / Math.max(all.length, 1)) * 100)}% des envois`} hintTone="success" />
        <StatCard label="En attente" value={pending} icon={Send} accent="amber" hint={pending > 0 ? 'à relancer si due_at proche' : '—'} hintTone={pending > 0 ? 'warning' : 'neutral'} />
        <StatCard label="NPS moyen" value={<span>{npsAvg}<span className="text-[15px] text-zinc-400 font-normal">/10</span></span>} icon={Star} accent="violet" hint="↑ 0.4 vs trimestre" hintTone="success" />
      </section>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[180px_140px_1fr_140px_140px_120px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Type</div>
          <div>Dossier</div>
          <div>Destinataire</div>
          <div>Échéance</div>
          <div>NPS</div>
          <div>Statut</div>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {all.map((q) => {
            const kind = q.template?.kind ?? '';
            const submittedAt = q.response?.submitted_at ?? null;
            const nps = q.response?.nps ?? null;
            return (
              <li key={q.id}>
                <Link
                  href={`/dossiers/${q.dossier_id}/questionnaires`}
                  className="grid grid-cols-[180px_140px_1fr_140px_140px_120px] gap-3 px-5 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                >
                  <span className="text-zinc-900 dark:text-zinc-100 font-medium">{labels[kind] ?? q.template?.title ?? kind}</span>
                  <IdPill>{q.dossier?.reference ?? '—'}</IdPill>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{q.recipient_name ?? q.recipient_email ?? '—'}</span>
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {submittedAt
                      ? `répondu ${format(parseISO(submittedAt), 'dd/MM', { locale: fr })}`
                      : q.due_at
                        ? `due ${format(parseISO(q.due_at), 'dd/MM', { locale: fr })}`
                        : '—'}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {nps != null ? `${nps}/10` : '—'}
                  </span>
                  <StatusPill tone={q.status === 'completed' ? 'success' : q.status === 'expired' ? 'danger' : q.status === 'in_progress' ? 'warning' : 'info'}>
                    {q.status === 'completed' ? 'rempli' : q.status === 'expired' ? 'expiré' : q.status === 'in_progress' ? 'en cours' : 'envoyé'}
                  </StatusPill>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
