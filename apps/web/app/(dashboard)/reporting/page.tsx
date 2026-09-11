// ARCHETYPE: command
// Justification: vue reporting (module 3.12) — consomme app.v_org_reporting (7 KPIs).

import {
  Users as UsersIcon, FolderOpen, ShieldCheck, ClipboardList, Clock, Banknote, MessageSquareWarning,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS, AccentBar, KpiCard, type Accent } from '@/shared/ui/kpi-card';

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

const CARD = 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm';

export default async function ReportingPage() {
  const sb = supabaseServer();
  const { data } = await sb.schema('app').from('v_org_reporting' as never).select('*').maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (data as any as Reporting | null) ?? null;

  const hoursRatio =
    r && r.hours_planned > 0 ? Math.round((Number(r.hours_delivered) / Number(r.hours_planned)) * 100) : null;
  const funders = r?.pipeline_by_funder ? Object.entries(r.pipeline_by_funder) : [];
  const fundersSorted = [...funders].sort((a, b) => Number(b[1]) - Number(a[1]));
  const fundersMax = Math.max(1, ...fundersSorted.map(([, n]) => Number(n)));

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Pilotage</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Reporting</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Indicateurs clés de l'organisme — pipeline, formation, conformité, finances.
        </p>
      </header>

      {!r ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune donnée disponible pour le moment.</p>
      ) : (
        <div className="space-y-4">
          {/* Activité */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="Activité">
            <KpiCard icon={FolderOpen} accent="orange" label="Dossiers en formation" value={r.dossiers_active} hint="actifs / planifiés" />
            <KpiCard icon={UsersIcon} accent="rose" label="Pipeline pré-inscription" value={r.pipeline_prospects} hint="demandes en cours" />
            <KpiCard
              icon={MessageSquareWarning}
              accent={r.complaints_open > 0 ? 'amber' : 'emerald'}
              label="Réclamations ouvertes"
              value={r.complaints_open}
              hint="à traiter"
            />
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ventilation pipeline */}
            <div className={`${CARD} p-5`}>
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <CardTitle icon={UsersIcon} accent="orange">Pipeline par financeur</CardTitle>
                <p className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS.orange.soft}`}>
                  {r.pipeline_prospects} demande{r.pipeline_prospects > 1 ? 's' : ''}
                </p>
              </div>
              {fundersSorted.length === 0 ? (
                <p className="text-[13px] text-zinc-400">Aucune demande en cours.</p>
              ) : (
                <ul className="grid gap-3">
                  {fundersSorted.map(([k, n]) => {
                    const v = Number(n);
                    return (
                      <li key={k} title={`${FUNDER_LABEL[k] ?? k} · ${v} demande${v > 1 ? 's' : ''}`}>
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{FUNDER_LABEL[k] ?? k}</span>
                          <span className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{v}</span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-orange-100 dark:bg-orange-950/50">
                          <div className="h-full rounded-full bg-orange-500" style={{ width: `${(v / fundersMax) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Conformité et questionnaires */}
            <div className={`${CARD} p-5`}>
              <CardTitle icon={ShieldCheck} accent="purple" className="mb-4">Qualité</CardTitle>
              <ul className="grid gap-5">
                <RateRow icon={ShieldCheck} accent="purple" label="Conformité Qualiopi" value={r.qualiopi_conformity_pct} hint="dossiers prêts" />
                <RateRow icon={ClipboardList} accent="teal" label="Retour questionnaires" value={r.questionnaire_return_rate_pct} hint="satisfaction remplis" />
              </ul>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
            {/* Heures */}
            <div className={`${CARD} p-5`}>
              <CardTitle icon={Clock} accent="sky">Heures réalisées</CardTitle>
              <p className={`text-[28px] leading-none font-extrabold tabular-nums mt-4 ${ACCENTS.sky.value}`}>
                {hrs(r.hours_delivered)}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-2 tabular-nums">
                sur {hrs(r.hours_planned)} prévues{hoursRatio != null ? ` · ${hoursRatio}%` : ''}
              </p>
              <div title={`${hrs(r.hours_delivered)} réalisées sur ${hrs(r.hours_planned)} prévues`}>
                <AccentBar value={Math.min(100, hoursRatio ?? 0)} max={100} accent="sky" className="mt-4" />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400 tabular-nums">
                <span>0 h</span>
                <span>{hrs(r.hours_planned)}</span>
              </div>
            </div>

            {/* Finances */}
            <div className={`${CARD} p-5 min-w-0`}>
              <CardTitle icon={Banknote} accent="emerald" className="mb-4">Finances</CardTitle>
              <FinanceChart
                rows={[
                  { label: 'CA facturé (mois)', hint: 'ce mois-ci', cents: r.ca_invoiced_month_cents, fill: 'fill-emerald-500' },
                  { label: 'Encaissé (mois)', hint: 'ce mois-ci', cents: r.ca_collected_month_cents, fill: 'fill-blue-500' },
                  { label: 'À encaisser', hint: 'restant dû', cents: r.ca_outstanding_cents, fill: 'fill-amber-500' },
                ]}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function CardTitle({
  icon: Icon, accent, className, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`text-[14px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5 ${className ?? ''}`}>
      <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS[accent].soft}`}>
        <Icon className="w-4 h-4" />
      </span>
      {children}
    </p>
  );
}

function RateRow({
  icon: Icon, accent, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  label: string;
  value: number | null;
  hint: string;
}) {
  const v = value == null ? null : Math.max(0, Math.min(100, Math.round(Number(value))));
  return (
    <li title={`${label} · ${pct(value)}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          <span className={`w-7 h-7 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS[accent].soft}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          {label}
        </span>
        <span className={`text-[20px] leading-none font-extrabold tabular-nums ${ACCENTS[accent].value}`}>{pct(value)}</span>
      </div>
      <AccentBar value={v ?? 0} max={100} accent={accent} className="mt-2" />
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1.5">{hint}</p>
    </li>
  );
}

function FinanceChart({ rows }: { rows: { label: string; hint: string; cents: number | null; fill: string }[] }) {
  const w = 520;
  const rowH = 44;
  const labelW = 136;
  const valueW = 92;
  const h = rows.length * rowH;
  const iw = w - labelW - valueW;
  const max = Math.max(1, ...rows.map((r) => Number(r.cents ?? 0)));
  const bh = 16;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="CA facturé, encaissé et restant à encaisser" className="block overflow-visible">
      {[0, 0.5, 1].map((t) => (
        <line
          key={t}
          x1={labelW + t * iw}
          x2={labelW + t * iw}
          y1={0}
          y2={h}
          className="stroke-zinc-200 dark:stroke-zinc-800"
          strokeDasharray={t === 0 ? undefined : '2 3'}
        />
      ))}
      {rows.map((r, i) => {
        const v = Number(r.cents ?? 0);
        const bw = v > 0 ? Math.max(2, (v / max) * iw) : 0;
        const y = i * rowH + (rowH - bh) / 2;
        return (
          <g key={r.label}>
            <text x={0} y={y + 6} className="fill-zinc-900 dark:fill-zinc-100 text-[12px] font-semibold">
              {r.label}
            </text>
            <text x={0} y={y + 20} className="fill-zinc-400 text-[11px]">
              {r.hint}
            </text>
            {bw > 0 ? (
              <rect x={labelW} y={y} width={bw} height={bh} rx={4} className={r.fill}>
                <title>{`${r.label} · ${euros(r.cents)}`}</title>
              </rect>
            ) : (
              <rect x={labelW} y={y + bh / 2 - 1} width={2} height={2} className="fill-zinc-300 dark:fill-zinc-700">
                <title>{`${r.label} · ${euros(r.cents)}`}</title>
              </rect>
            )}
            <text
              x={labelW + bw + 8}
              y={y + bh / 2 + 4}
              className="fill-zinc-900 dark:fill-zinc-100 text-[12px] font-bold tabular-nums"
            >
              {euros(r.cents)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
