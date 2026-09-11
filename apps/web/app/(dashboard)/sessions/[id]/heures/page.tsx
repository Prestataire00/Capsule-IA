import { notFound } from 'next/navigation';
import { Clock, CalendarClock, Users } from 'lucide-react';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const timeFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soir' };

export default async function SessionHoursTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session, sheets, learners } = loaded;

  const hours = Number(session.duration_hours ?? 0);
  const totalStagiaireHours = hours * learners.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard icon={CalendarClock} accent="blue" label="Créneau" value={`${timeFmt.format(new Date(session.starts_at))} – ${timeFmt.format(new Date(session.ends_at))}`} />
        <KpiCard icon={Clock} accent="sky" label="Heures de formation" value={`${hours} h`} />
        <KpiCard icon={Users} accent="rose" label="Heures × stagiaires" value={`${totalStagiaireHours} h`} hint={`${learners.length} stagiaire${learners.length > 1 ? 's' : ''}`} />
      </div>

      <div>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.sky.soft}`}>
            <Clock className="w-4 h-4" />
          </span>
          Découpage
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.sky.soft}`}>{sheets.length}</span>
        </h2>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
          {sheets.length === 0 ? (
            <li className="px-5 py-3.5 text-zinc-500 dark:text-zinc-400">Aucune demi-journée matérialisée.</li>
          ) : (
            sheets.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-bold ${ACCENTS.blue.soft}`}>
                  {HALF_DAY[s.half_day] ?? s.half_day}
                </span>
                <span className="flex items-center gap-3 text-[12px] text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {s.signed}/{s.total} présences signées
                  <AccentBar
                    value={s.signed}
                    max={s.total}
                    accent={s.total > 0 && s.signed >= s.total ? 'emerald' : 'amber'}
                    className="w-24"
                  />
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
