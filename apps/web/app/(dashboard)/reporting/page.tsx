// ARCHETYPE: command
// Justification: vue reporting (module 3.12) — consomme app.v_org_reporting (7 KPIs).

import {
  Users as UsersIcon, FolderOpen, ShieldCheck, ClipboardList, Clock, Banknote, MessageSquareWarning,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';

export const dynamic = 'force-dynamic';

type Reporting = {
  pipeline_prospects: number;
  pipeline_by_funder: Record<string, number> | null;
  dossiers_active: number;
  qualiopi_conformity_pct: number | null;
  questionnaire_return_rate_pct: number | null;
  hours_delivered: number;
  hours_planned: number;
  ca_invoiced_month_cents: number;
  ca_collected_month_cents: number;
  ca_outstanding_cents: number;
  complaints_open: number;
};

const euros = (c: number | null | undefined) =>
  c == null ? '—' : `${Math.round(c / 100).toLocaleString('fr-FR')} €`;
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(Number(v))} %`);
const hrs = (v: number | null | undefined) => `${Number(v ?? 0).toLocaleString('fr-FR')} h`;

const FUNDER_LABEL: Record<string, string> = {
  opco: 'OPCO', faf_ca: 'FAF-CA', agefiph: 'AGEFIPH', cpf: 'CPF',
  pole_emploi: 'France Travail', region: 'Région', entreprise: 'Entreprise',
  autofinancement: 'Autofinancement', autre: 'Autre',
};

export default async function ReportingPage() {
  const sb = supabaseServer();
  const { data } = await sb.schema('app').from('v_org_reporting' as never).select('*').maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (data as any as Reporting | null) ?? null;

  const hoursRatio =
    r && r.hours_planned > 0 ? Math.round((Number(r.hours_delivered) / Number(r.hours_planned)) * 100) : null;
  const funders = r?.pipeline_by_funder ? Object.entries(r.pipeline_by_funder) : [];

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-10">
      <header className="mb-8">
        <SectionLabel className="mb-2">Pilotage</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Reporting</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Indicateurs clés de l'organisme — pipeline, formation, conformité, finances.
        </p>
      </header>

      {!r ? (
        <p className="text-[13px] text-zinc-500">Aucune donnée disponible pour le moment.</p>
      ) : (
        <div className="space-y-8">
          {/* Activité */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={UsersIcon} accent="blue" label="Pipeline pré-inscription" value={r.pipeline_prospects} hint="demandes en cours" />
            <Kpi icon={FolderOpen} accent="violet" label="Dossiers en formation" value={r.dossiers_active} hint="actifs / planifiés" />
            <Kpi icon={ShieldCheck} accent="emerald" label="Conformité Qualiopi" value={pct(r.qualiopi_conformity_pct)} hint="dossiers prêts" />
            <Kpi icon={ClipboardList} accent="amber" label="Retour questionnaires" value={pct(r.questionnaire_return_rate_pct)} hint="satisfaction remplis" />
          </section>

          {/* Heures + finances */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Clock} accent="blue" label="Heures réalisées" value={hrs(r.hours_delivered)} hint={`sur ${hrs(r.hours_planned)} prévues${hoursRatio != null ? ` · ${hoursRatio}%` : ''}`} />
            <Kpi icon={Banknote} accent="emerald" label="CA facturé (mois)" value={euros(r.ca_invoiced_month_cents)} hint="ce mois-ci" />
            <Kpi icon={Banknote} accent="violet" label="Encaissé (mois)" value={euros(r.ca_collected_month_cents)} hint="ce mois-ci" />
            <Kpi icon={Banknote} accent="amber" label="À encaisser" value={euros(r.ca_outstanding_cents)} hint="restant dû" />
          </section>

          {/* Réclamations + ventilation pipeline */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <Kpi icon={MessageSquareWarning} accent="rose" label="Réclamations ouvertes" value={r.complaints_open} hint="à traiter" />
            </div>
            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
              <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium mb-3">Pipeline par financeur</p>
              {funders.length === 0 ? (
                <p className="text-[13px] text-zinc-400">Aucune demande en cours.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {funders.map(([k, n]) => (
                    <li key={k} className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full px-3 py-1 text-[12px] text-zinc-700 dark:text-zinc-300">
                      {FUNDER_LABEL[k] ?? k} <span className="font-mono font-medium">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const accents: Record<string, string> = {
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
  violet: 'bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400',
};

function Kpi({
  icon: Icon, accent, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: keyof typeof accents | string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">{label}</p>
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${accents[accent] ?? accents.blue}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="text-[22px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{hint}</p>}
    </div>
  );
}
