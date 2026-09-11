// ARCHETYPE: command
// Justification: pilotage org-wide du risque "heures sous le volume payé financeur" — vue de triage transverse complétant l'onglet par-dossier.

import Link from 'next/link';
import { AlertTriangle, Clock, ShieldCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

type RiskRow = {
  dossier_id: string;
  hours_planned: number;
  hours_delivered: number;
  projected_final_hours: number;
  attendance_rate: number;
  absences_count: number;
  dossiers: { reference: string; abandoned_at: string | null } | null;
};

type DossierRef = { id: string; reference: string; abandoned_at: string | null };

function fmtHours(n: number): string {
  return `${Number(n).toFixed(1)} h`;
}

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_90px_90px_minmax(0,1.2fr)_90px_90px_48px] gap-4 px-5';

export default async function HeuresRisquePage() {
  const sb = supabaseServer();
  // RLS : dossier_hours_tracking est lisible pour l'organisation du JWT (policy dossier_hours_tracking_select, 0146).
  // Select plat + cast : la table n'est pas (encore) dans database.ts (cf. page par-dossier).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trackingTable = sb.schema('app').from('dossier_hours_tracking' as never) as any;
  const { data: hData } = await trackingTable
    .select('dossier_id, hours_planned, hours_delivered, projected_final_hours, attendance_rate, absences_count')
    .eq('at_risk', true)
    .order('projected_final_hours', { ascending: true });
  const flat = (hData ?? []) as Array<Omit<RiskRow, 'dossiers'>>;

  // Références des dossiers (requête séparée pour éviter une jointure non typée)
  const ids = flat.map((r) => r.dossier_id);
  let refs = new Map<string, DossierRef>();
  if (ids.length > 0) {
    const { data: dData } = await sb.schema('app').from('dossiers').select('id, reference, abandoned_at').in('id', ids);
    refs = new Map(((dData ?? []) as unknown as DossierRef[]).map((d) => [d.id, d]));
  }

  const rows: RiskRow[] = flat.map((r) => {
    const d = refs.get(r.dossier_id);
    return { ...r, dossiers: d ? { reference: d.reference, abandoned_at: d.abandoned_at } : null };
  });
  const totalGap = rows.reduce((acc, r) => acc + Math.max(0, Number(r.hours_planned) - Number(r.projected_final_hours)), 0);

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Pilotage</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Heures à risque</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Dossiers dont le volume projeté finira sous les heures payées par le financeur.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6" aria-label="Synthèse">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
          <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-zinc-400" /> Dossiers à risque
          </p>
          <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100 mt-3">{rows.length}</p>
          <div className="mt-2">
            <StatusPill tone={rows.length > 0 ? 'warning' : 'success'}>{rows.length > 0 ? 'à traiter' : 'aucun'}</StatusPill>
          </div>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
          <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" /> Heures manquantes (cumul)
          </p>
          <p
            className={`text-[26px] leading-none font-extrabold tabular-nums mt-3 ${
              totalGap > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {fmtHours(totalGap)}
          </p>
        </div>
      </section>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
            <div>Dossier</div>
            <div className="text-right">Payé</div>
            <div className="text-right">Délivré</div>
            <div>Projeté</div>
            <div className="text-right">Écart</div>
            <div className="text-right">Assiduité</div>
            <div className="sr-only">Actions</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <ShieldCheck className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun dossier à risque.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((r) => {
                const gap = Math.max(0, Number(r.hours_planned) - Number(r.projected_final_hours));
                const planned = Number(r.hours_planned);
                const projectedPct = planned > 0 ? Math.min(100, (Number(r.projected_final_hours) / planned) * 100) : 0;
                const deliveredPct = planned > 0 ? Math.min(100, (Number(r.hours_delivered) / planned) * 100) : 0;
                return (
                  <li key={r.dossier_id}>
                    <Link
                      href={`/dossiers/${r.dossier_id}/heures`}
                      className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group`}
                    >
                      <span className="min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                          {r.dossiers?.reference ?? r.dossier_id.slice(0, 8)}
                        </span>
                        {r.dossiers?.abandoned_at && <StatusPill tone="danger">abandon</StatusPill>}
                        {r.absences_count > 0 && (
                          <StatusPill tone="warning">
                            <span className="tabular-nums">{r.absences_count} abs.</span>
                          </StatusPill>
                        )}
                      </span>
                      <span className="text-right text-zinc-700 dark:text-zinc-300 tabular-nums">{fmtHours(r.hours_planned)}</span>
                      <span className="text-right text-zinc-700 dark:text-zinc-300 tabular-nums">{fmtHours(r.hours_delivered)}</span>
                      <span
                        className="min-w-0"
                        title={`Délivré ${fmtHours(r.hours_delivered)} · projeté ${fmtHours(r.projected_final_hours)} · payé ${fmtHours(r.hours_planned)}`}
                      >
                        <span className="block font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{fmtHours(r.projected_final_hours)}</span>
                        <span className="relative mt-1.5 block h-1.5 w-full max-w-[160px] rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-amber-300 dark:bg-amber-700" style={{ width: `${projectedPct}%` }} />
                          <span className="absolute inset-y-0 left-0 rounded-full bg-orange-500" style={{ width: `${deliveredPct}%` }} />
                        </span>
                      </span>
                      <span className="text-right font-bold text-red-600 dark:text-red-400 tabular-nums">−{fmtHours(gap)}</span>
                      <span className="text-right text-zinc-500 dark:text-zinc-400 tabular-nums">{Number(r.attendance_rate).toFixed(0)}%</span>
                      <span
                        aria-hidden="true"
                        className="ml-auto w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 group-hover:bg-orange-50 group-hover:text-orange-600 dark:group-hover:bg-orange-950/40 dark:group-hover:text-orange-300 transition"
                      >
                        <Clock className="w-4 h-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
