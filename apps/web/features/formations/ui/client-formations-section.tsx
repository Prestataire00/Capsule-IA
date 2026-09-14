// ARCHETYPE: command (section d'une fiche client : ses formations sur mesure)
import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Sparkles, CalendarClock, FolderOpen, ArrowUpRight } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { loadClientFormations, MODALITY_LABEL, type ClientKind } from '../bespoke';
import { BespokeFormationDialog } from './bespoke-formation-dialog.client';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const heures = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * Formations montées pour ce client seul (hors catalogue), avec le tarif fixé
 * par l'organisme, et le raccourci pour enchaîner sur un dossier ou une séance.
 */
export async function ClientFormationsSection({
  clientKind,
  clientId,
  clientName,
}: {
  clientKind: ClientKind;
  clientId: string;
  clientName: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseServer() as unknown as SupabaseClient<any, any, any>;
  const formations = await loadClientFormations(sb, clientKind, clientId);
  const a = ACCENTS.teal;

  return (
    <section className="mt-10 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${a.soft}`}>
            <Sparkles className="w-4 h-4" />
          </span>
          Formations sur mesure
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${a.soft}`}>{formations.length}</span>
        </h2>
        <BespokeFormationDialog clientKind={clientKind} clientId={clientId} clientName={clientName} />
      </div>

      {formations.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
          Aucune formation sur mesure pour ce client. Créez-en une hors catalogue, avec votre propre tarif, puis
          planifiez ses séances.
        </p>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[minmax(0,1.6fr)_120px_130px_110px_minmax(0,220px)] gap-4 px-5 h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800">
              <div>Formation</div>
              <div>Durée</div>
              <div>Modalité</div>
              <div>Tarif HT</div>
              <div className="text-right">Suite</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {formations.map((f) => (
                <li key={f.id} className="grid grid-cols-[minmax(0,1.6fr)_120px_130px_110px_minmax(0,220px)] gap-4 px-5 py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="min-w-0">
                    <Link href={`/formations/${f.id}`} className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-300">
                      {f.title}
                    </Link>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                      <span className="font-mono">{f.code}</span>
                      {f.summary ? ` · ${f.summary}` : ''}
                    </p>
                  </div>
                  <div className="text-[13px] tabular-nums text-zinc-700 dark:text-zinc-300">{heures.format(f.durationHours)} h</div>
                  <div>
                    <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                      {MODALITY_LABEL[f.modality] ?? f.modality}
                    </span>
                  </div>
                  <div className="text-[14px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{euro.format(f.priceCents / 100)}</div>
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1" title="Séances planifiées">
                        <CalendarClock className="w-3.5 h-3.5" />
                        {f.sessionsCount}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Dossiers">
                        <FolderOpen className="w-3.5 h-3.5" />
                        {f.dossiersCount}
                      </span>
                    </span>
                    <Link
                      href={
                        clientKind === 'individual'
                          ? `/dossiers/nouveau?learnerId=${clientId}&formationId=${f.id}`
                          : `/formations/${f.id}`
                      }
                      className="text-[12px] font-bold px-2.5 h-7 rounded-md inline-flex items-center gap-1 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 transition"
                    >
                      {clientKind === 'individual' ? 'Créer le dossier' : 'Planifier'}
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
