// ARCHETYPE: command
// Justification: vue d'ensemble des questionnaires assignés (positionnement, satisfaction) avec NPS agrégé.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClipboardList, Star, Send } from 'lucide-react';
import { questionnairesByDossier, dossiers, learnerFullName } from '@/shared/mock/data';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { StatCard } from '@/shared/ui/stat-card';

const labels = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
} as const;

export default function QuestionnairesPage() {
  const all = Object.entries(questionnairesByDossier).flatMap(([did, list]) =>
    list.map((q) => ({ ...q, dossierId: did })),
  );
  const completed = all.filter((q) => q.status === 'completed').length;
  const pending = all.filter((q) => q.status === 'pending' || q.status === 'in_progress').length;
  const expired = all.filter((q) => q.status === 'expired').length;
  const npsAvg = 8.4; // mock

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
            const dossier = dossiers.find((d) => d.id === q.dossierId);
            if (!dossier) return null;
            return (
              <li key={q.id}>
                <Link
                  href={`/dossiers/${dossier.id}/questionnaires`}
                  className="grid grid-cols-[180px_140px_1fr_140px_140px_120px] gap-3 px-5 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                >
                  <span className="text-zinc-900 dark:text-zinc-100 font-medium">{labels[q.kind]}</span>
                  <IdPill>{dossier.reference}</IdPill>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">{q.recipient}</span>
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {q.submittedAt
                      ? `répondu ${format(parseISO(q.submittedAt), 'dd/MM', { locale: fr })}`
                      : `due ${format(parseISO(q.dueAt), 'dd/MM', { locale: fr })}`}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                    {q.nps != null ? `${q.nps}/10` : '—'}
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
