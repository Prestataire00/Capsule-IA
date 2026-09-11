import { notFound } from 'next/navigation';
import { Clock } from 'lucide-react';
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="Créneau" value={`${timeFmt.format(new Date(session.starts_at))} – ${timeFmt.format(new Date(session.ends_at))}`} />
        <Stat label="Heures de formation" value={`${hours} h`} />
        <Stat label="Heures × stagiaires" value={`${totalStagiaireHours} h`} />
      </div>

      <div>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" /> Découpage
        </h2>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
          {sheets.length === 0 ? (
            <li className="px-5 py-3.5 text-zinc-500 dark:text-zinc-400">Aucune demi-journée matérialisée.</li>
          ) : (
            sheets.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{HALF_DAY[s.half_day] ?? s.half_day}</span>
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{s.signed}/{s.total} présences signées</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
      <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 mb-3">{label}</p>
      <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
