// ARCHETYPE: workflow
// Justification: suivi heures dispensées/suivies + risque sous-volume + abandon.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { InfoCallout } from '@/shared/ui/info-callout';
import { KpiCard, ACCENTS, AccentBar } from '@/shared/ui/kpi-card';
import { Clock, CalendarCheck, UserCheck, TrendingUp } from 'lucide-react';
import { markDossierAbandoned, recomputeHoursNow } from './actions';

export default async function HeuresPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: dossier } = await sb.schema('app').from('dossiers')
    .select('id, total_hours, abandoned_at, abandon_reason').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();

  // Prod-safe : snapshot absent (table non migrée / jamais calculé) → valeurs 0.
  const { data: h } = await sb.schema('app').from('dossier_hours_tracking')
    .select('hours_planned, hours_delivered, hours_attended, hours_remaining_planned, projected_final_hours, attendance_rate, sessions_held, absences_count, justified_absences_count, at_risk')
    .eq('dossier_id', params.id).maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (h as any) ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dossier as any;
  const planned = Number(m.hours_planned ?? d.total_hours ?? 0);
  const abandoned = d.abandoned_at as string | null;

  const rate = Number(m.attendance_rate ?? 0);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <SectionLabel>Suivi des heures</SectionLabel>
        <form action={async () => { 'use server'; await recomputeHoursNow(params.id); }}>
          <button type="submit" className="h-9 border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition">Recalculer</button>
        </form>
      </header>

      {m.at_risk && (
        <InfoCallout tone="warning">
          <p className="font-bold">Risque de sous-volume financeur</p>
          <p className="text-[12px] mt-1 tabular-nums">Projeté {Number(m.projected_final_hours ?? 0)}h &lt; financé {planned}h.</p>
        </InfoCallout>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Clock} label="Prévu (financé)" accent="sky" value={`${planned}h`} />
        <KpiCard icon={CalendarCheck} label="Dispensé (OF)" accent="blue" value={`${Number(m.hours_delivered ?? 0)}h`} />
        <KpiCard icon={UserCheck} label="Suivi (apprenant)" accent="rose" value={`${Number(m.hours_attended ?? 0)}h`} />
        <KpiCard icon={TrendingUp} label="Projeté final" accent={m.at_risk ? 'amber' : 'emerald'} value={`${Number(m.projected_final_hours ?? 0)}h`} />
      </div>

      <div className="space-y-3">
        <div className="max-w-md">
          <div className="flex items-center justify-between text-[13px] mb-1.5 tabular-nums">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Assiduité</span>
            <span className={`font-bold ${rate >= 100 ? ACCENTS.emerald.text : ACCENTS.amber.text}`}>{rate}%</span>
          </div>
          <AccentBar value={rate} max={100} accent={rate >= 100 ? 'emerald' : 'amber'} />
        </div>
        <div className="flex flex-wrap gap-2 text-[13px] tabular-nums">
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${ACCENTS.amber.soft}`}>
            Absences : {Number(m.absences_count ?? 0)} (dont {Number(m.justified_absences_count ?? 0)} justifiées)
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-bold ${ACCENTS.blue.soft}`}>
            Sessions tenues : {Number(m.sessions_held ?? 0)}
          </span>
        </div>
      </div>

      <section className="border-t border-zinc-200/70 dark:border-zinc-800 pt-5">
        <SectionLabel className="mb-2">Abandon</SectionLabel>
        {abandoned ? (
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums">
            Abandon enregistré le {new Date(abandoned).toLocaleDateString('fr-FR')}
            {d.abandon_reason ? ` — ${d.abandon_reason}` : ''}.
          </p>
        ) : (
          <form
            action={async (fd: FormData) => {
              'use server';
              await markDossierAbandoned(params.id, String(fd.get('date') ?? ''), String(fd.get('reason') ?? ''));
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">Date
              <input type="date" name="date" required className="mt-1.5 block h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] font-normal tabular-nums transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10" />
            </label>
            <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 flex-1 min-w-[200px]">Motif
              <input type="text" name="reason" className="mt-1.5 block w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] font-normal transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10" />
            </label>
            <button type="submit" className="h-9 border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition">
              Marquer un abandon
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
