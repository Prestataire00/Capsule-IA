// ARCHETYPE: command
// Justification: espace de programmation des envois d'emails — règles paramétrables
// (rappel X jours avant/après une date du dossier), création/édition/activation.

import { CalendarClock, Mail, Power } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
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
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-3xl">
          Programmez des emails automatiques relatifs à une date d'un dossier — par exemple un
          rappel 3 jours avant le début de la 1ʳᵉ session. Les règles actives sont évaluées chaque
          jour et envoient une seule fois par dossier.{' '}
          <span className="tabular-nums">
            {rules.length} règle{rules.length > 1 ? 's' : ''} · {rules.filter((r) => r.enabled).length} active{rules.filter((r) => r.enabled).length > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-2xl" aria-label="Synthèse">
        <KpiCard label="Règles programmées" value={rules.length} icon={Mail} accent="sky" hint="emails automatiques" />
        <KpiCard label="Actives" value={rules.filter((r) => r.enabled).length} icon={Power} accent="emerald">
          <AccentBar value={rules.filter((r) => r.enabled).length} max={rules.length} accent="emerald" />
        </KpiCard>
      </section>

      <div className="flex items-start gap-3 mb-6 text-[12px] text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm px-4 py-3">
        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
          <CalendarClock className="w-4 h-4" />
        </span>
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
