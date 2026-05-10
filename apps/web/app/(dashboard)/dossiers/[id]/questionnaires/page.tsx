// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Send } from 'lucide-react';
import { dossiers, questionnairesByDossier } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

const labels = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
} as const;

export default function QuestionnairesPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();
  const list = questionnairesByDossier[params.id] ?? [];

  return (
    <div>
      <header className="mb-4">
        <SectionLabel className="mb-1">Questionnaires</SectionLabel>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          {list.length} questionnaire{list.length > 1 ? 's' : ''} assigné{list.length > 1 ? 's' : ''}
        </p>
      </header>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {list.map((q) => (
          <li key={q.id} className="grid grid-cols-[180px_1fr_140px_140px_120px] gap-3 py-3 px-1 items-center text-[13px] group">
            <span className="text-zinc-900 dark:text-zinc-100">{labels[q.kind]}</span>
            <span className="text-zinc-500 dark:text-zinc-400 truncate">{q.recipient}</span>
            <span className="font-mono text-[11px] text-zinc-500">
              {q.submittedAt ? `répondu ${format(parseISO(q.submittedAt), 'dd/MM', { locale: fr })}` : `dû ${format(parseISO(q.dueAt), 'dd/MM', { locale: fr })}`}
            </span>
            <StatusPill tone={q.status === 'completed' ? 'success' : q.status === 'expired' ? 'danger' : q.status === 'in_progress' ? 'warning' : 'info'}>
              {q.status === 'completed' ? 'rempli' : q.status === 'expired' ? 'expiré' : q.status === 'in_progress' ? 'en cours' : 'envoyé'}
            </StatusPill>
            {q.status === 'pending' && (
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 transition justify-end"
              >
                <Send className="w-3 h-3" />
                Relancer
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
