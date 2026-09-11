// ARCHETYPE: command
// Justification: espace de programmation des envois d'emails — règles paramétrables
// (rappel X jours avant/après une date du dossier), création/édition/activation.

import { CalendarClock } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { SchedulesManager, type ScheduleRow } from './schedules-manager';

export const dynamic = 'force-dynamic';

export default async function ProgrammationPage() {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('email_schedules' as never)
    .select('id, name, anchor, offset_days, recipient_kind, subject, body, attachment_kind, enabled')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const rules = (data as unknown as ScheduleRow[] | null) ?? [];

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Communication</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Programmation des envois</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-3xl">
          Programmez des emails automatiques relatifs à une date d'un dossier — par exemple un
          rappel 3 jours avant le début de la 1ʳᵉ session. Les règles actives sont évaluées chaque
          jour et envoient une seule fois par dossier.{' '}
          <span className="tabular-nums">
            {rules.length} règle{rules.length > 1 ? 's' : ''} · {rules.filter((r) => r.enabled).length} active{rules.filter((r) => r.enabled).length > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <div className="flex items-start gap-2 mb-6 text-[12px] text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 py-3">
        <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" />
        <span>
          Variables utilisables dans l'objet et le corps :{' '}
          <code className="font-mono text-[12px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 px-1 rounded">{'{prenom}'}</code>{' '}
          <code className="font-mono text-[12px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 px-1 rounded">{'{nom}'}</code>{' '}
          <code className="font-mono text-[12px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 px-1 rounded">{'{formation}'}</code>{' '}
          <code className="font-mono text-[12px] text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 px-1 rounded">{'{date}'}</code> (la date de
          l'ancre choisie).
        </span>
      </div>

      <SchedulesManager rules={rules} />
    </div>
  );
}
