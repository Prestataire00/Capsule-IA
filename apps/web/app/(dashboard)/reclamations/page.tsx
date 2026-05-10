// ARCHETYPE: command
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { complaints, dossiers } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';

const sevTone = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' } as const;
const sevLabel = { low: 'mineure', medium: 'moyenne', high: 'élevée', critical: 'critique' };
const stateLabel = { open: 'ouverte', in_progress: 'en cours', resolved: 'résolue', closed: 'clôturée' };

export default function ReclamationsPage() {
  const open = complaints.filter((c) => c.status === 'open' || c.status === 'in_progress');
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="flex items-end justify-between mb-6">
        <div>
          <SectionLabel className="mb-1">Qualité</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Réclamations</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            {open.length} ouverte{open.length > 1 ? 's' : ''} · {complaints.length} au total · indicateur Qualiopi I31
          </p>
        </div>
        <Link
          href="#"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouvelle réclamation
        </Link>
      </header>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {complaints.map((c) => {
          const dossier = c.dossierId ? dossiers.find((d) => d.id === c.dossierId) : null;
          return (
            <li key={c.id}>
              <Link
                href="#"
                className="grid grid-cols-[120px_1fr_120px_140px_100px_100px] gap-3 py-3 px-1 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
              >
                <IdPill>{c.reference}</IdPill>
                <span className="text-zinc-900 dark:text-zinc-100 truncate">{c.subject}</span>
                <span className="text-zinc-500 dark:text-zinc-400">{c.assignedTo ?? <span className="text-zinc-400">non assignée</span>}</span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {format(parseISO(c.createdAt), 'dd MMM yyyy', { locale: fr })}
                </span>
                <StatusPill tone={sevTone[c.severity]}>{sevLabel[c.severity]}</StatusPill>
                <StatusPill tone={c.status === 'resolved' || c.status === 'closed' ? 'neutral' : c.status === 'in_progress' ? 'warning' : 'danger'}>
                  {stateLabel[c.status]}
                </StatusPill>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
