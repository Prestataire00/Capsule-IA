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
    <div className="max-w-4xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Communication</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Programmation des envois
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Programmez des emails automatiques relatifs à une date d'un dossier — par exemple un
          rappel 3 jours avant le début de la 1ʳᵉ session. Les règles actives sont évaluées chaque
          jour et envoient une seule fois par dossier.
        </p>
      </header>

      <div className="flex items-start gap-2 mb-6 text-[12px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2">
        <CalendarClock className="w-4 h-4 mt-0.5 shrink-0 text-violet-500" />
        <span>
          Variables utilisables dans l'objet et le corps :{' '}
          <code className="text-violet-600 dark:text-violet-400">{'{prenom}'}</code>{' '}
          <code className="text-violet-600 dark:text-violet-400">{'{nom}'}</code>{' '}
          <code className="text-violet-600 dark:text-violet-400">{'{formation}'}</code>{' '}
          <code className="text-violet-600 dark:text-violet-400">{'{date}'}</code> (la date de
          l'ancre choisie).
        </span>
      </div>

      <SchedulesManager rules={rules} />
    </div>
  );
}
