// ARCHETYPE: command
// Justification: log d'audit append-only — densité, recherche, traces horodatées.

import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { auditLog } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';

const actionLabel = { insert: 'création', update: 'modification', delete: 'suppression' };
const actionTone = { insert: 'success', update: 'info', delete: 'danger' } as const;

export default function AuditPage() {
  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Sécurité</SectionLabel>
        <h1 className="text-2xl font-medium">Audit log</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Toutes les modifications sensibles tracées avec acteur, IP et user-agent.
        </p>
      </header>

      <InfoCallout tone="info" className="mb-6">
        Le log d'audit est <strong>append-only</strong>. Conservation 10 ans pour les tables Qualiopi-critiques.
      </InfoCallout>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {auditLog.map((a) => (
          <li key={a.id} className="grid grid-cols-[140px_120px_180px_1fr_180px] gap-3 py-3 px-1 items-center text-[13px]">
            <span className="font-mono text-[11px] text-zinc-500">
              {format(parseISO(a.occurredAt), 'dd MMM HH:mm', { locale: fr })}
            </span>
            <StatusPill tone={actionTone[a.action]}>{actionLabel[a.action]}</StatusPill>
            <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{a.table}</span>
            <span className="text-zinc-700 dark:text-zinc-300 truncate">
              <IdPill className="mr-2">{a.rowRef}</IdPill>
              <span className="text-zinc-500">{a.summary}</span>
            </span>
            <span className="text-zinc-500 dark:text-zinc-400 truncate">{a.actor}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
