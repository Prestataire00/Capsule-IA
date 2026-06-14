// ARCHETYPE: command
// Justification: pilotage org-wide du risque "heures sous le volume payé financeur" — vue de triage transverse complétant l'onglet par-dossier.

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';

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

export default async function HeuresRisquePage() {
  const sb = supabaseServer();
  // RLS : dossier_hours_tracking est scopé à l'organisation du JWT (policy dossier_hours_tracking_rw).
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
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Heures à risque</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Dossiers dont le volume projeté finira sous les heures payées par le financeur.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Dossiers à risque"
          value={rows.length}
          icon={AlertTriangle}
          accent={rows.length > 0 ? 'amber' : 'emerald'}
          hint={rows.length > 0 ? 'à traiter' : 'aucun'}
          hintTone={rows.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Heures manquantes (cumul)"
          value={fmtHours(totalGap)}
          icon={AlertTriangle}
          accent={totalGap > 0 ? 'rose' : 'emerald'}
        />
      </section>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_90px_90px_90px_80px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Dossier</div>
          <div>Payé</div>
          <div>Délivré</div>
          <div>Projeté</div>
          <div>Écart</div>
          <div>Assiduité</div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-zinc-400">Aucun dossier à risque. 🎉</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => {
              const gap = Math.max(0, Number(r.hours_planned) - Number(r.projected_final_hours));
              return (
                <li key={r.dossier_id}>
                  <Link
                    href={`/dossiers/${r.dossier_id}/heures`}
                    className="grid grid-cols-[1fr_90px_90px_90px_90px_80px] gap-3 px-5 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                  >
                    <span className="text-zinc-900 dark:text-zinc-100 truncate inline-flex items-center gap-2">
                      {r.dossiers?.reference ?? r.dossier_id.slice(0, 8)}
                      {r.dossiers?.abandoned_at && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                          abandon
                        </span>
                      )}
                      {r.absences_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                          {r.absences_count} abs.
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[12px] text-zinc-700 dark:text-zinc-300 tabular-nums">{fmtHours(r.hours_planned)}</span>
                    <span className="font-mono text-[12px] text-zinc-700 dark:text-zinc-300 tabular-nums">{fmtHours(r.hours_delivered)}</span>
                    <span className="font-mono text-[12px] text-zinc-700 dark:text-zinc-300 tabular-nums">{fmtHours(r.projected_final_hours)}</span>
                    <span className="font-mono text-[12px] text-rose-600 tabular-nums">−{fmtHours(gap)}</span>
                    <span className="font-mono text-[12px] text-zinc-500 tabular-nums">{Number(r.attendance_rate).toFixed(0)}%</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
