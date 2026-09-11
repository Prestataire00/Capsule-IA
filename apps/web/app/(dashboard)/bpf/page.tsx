// ARCHETYPE: command
// Justification: Bilan Pédagogique et Financier (BPF — Cerfa 10443). Calcul auto
// des cadres B (produits ventilés), C (pédagogique), D (formateurs) pour une année,
// en vue de la télédéclaration. Lecture seule + impression.
import Link from 'next/link';
import type { ComponentType } from 'react';
import { TrendingUp, Users, Clock, UserCog, Banknote, GraduationCap } from 'lucide-react';
import { ACCENTS, KpiCard, type Accent } from '@/shared/ui/kpi-card';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { BPF_LINES } from '@/features/bpf/bpf';
import { loadBpfAggregates } from '@/features/bpf/load-bpf';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

function eur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export default async function BpfPage({ searchParams }: { searchParams: { year?: string } }) {
  const currentYear = new Date().getFullYear();
  const year = searchParams.year && /^\d{4}$/.test(searchParams.year) ? Number(searchParams.year) : currentYear;
  const sb = supabaseServer();
  const { financial, pedago, formateurs } = await loadBpfAggregates(sb as never, year);
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const lineMax = Math.max(0, ...BPF_LINES.map((l) => financial.lines[l.key]));

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9 space-y-6 print:py-2">
      <header className="flex items-end justify-between gap-4 flex-wrap print:block">
        <div>
          <SectionLabel className="mb-2">Qualité · Réglementaire</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">Bilan Pédagogique et Financier {year}</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-3xl">
            Cerfa 10443 — aide au remplissage de la télédéclaration (DREETS). Produits HT des factures
            émises dans l&apos;année.
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <nav aria-label="Année" className="inline-flex p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/70 text-[12px]">
            {years.map((y) => (
              <Link
                key={y}
                href={`/bpf?year=${y}`}
                aria-current={y === year ? 'page' : undefined}
                className={
                  y === year
                    ? 'px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold shadow-sm tabular-nums'
                    : 'px-3 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100 tabular-nums'
                }
              >
                {y}
              </Link>
            ))}
          </nav>
          <PrintButton year={year} />
        </div>
      </header>

      {/* KPI de synthèse de l'année */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          accent="emerald"
          label="Produits HT"
          value={eur(financial.totalCents)}
          icon={TrendingUp}
          hint={`${pedago.dossiers} dossier${pedago.dossiers > 1 ? 's' : ''} · ${pedago.actions} action${pedago.actions > 1 ? 's' : ''}`}
        />
        <KpiCard accent="rose" label="Stagiaires" value={pedago.stagiaires} icon={Users} hint="distincts sur l'année" />
        <KpiCard accent="sky" label="Heures dispensées" value={`${pedago.heures} h`} icon={Clock} hint="total heures des dossiers" />
        <KpiCard
          accent="teal"
          label="Formateurs intervenus"
          value={formateurs.total}
          icon={UserCog}
          hint={`${formateurs.internes} interne${formateurs.internes > 1 ? 's' : ''} · ${formateurs.externes} externe${formateurs.externes > 1 ? 's' : ''}`}
        />
      </section>

      {/* Cadre B — Bilan financier (produits) */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
          <CadreTitre icon={Banknote} accent="emerald">
            Cadre B — Bilan financier (origine des produits, HT)
          </CadreTitre>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {BPF_LINES.map((l) => {
            const v = financial.lines[l.key];
            return (
              <li key={l.key} className="grid grid-cols-[48px_minmax(0,1fr)_minmax(0,160px)_120px] gap-4 items-center px-5 py-3 text-[13px]">
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{l.code}</span>
                <span className="text-zinc-700 dark:text-zinc-300">{l.label}</span>
                <div className="h-2 rounded-full bg-emerald-100 dark:bg-emerald-950/50 print:hidden" aria-hidden>
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${lineMax > 0 ? (v / lineMax) * 100 : 0}%` }} />
                </div>
                <span className={`text-right tabular-nums ${v > 0 ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>{eur(v)}</span>
              </li>
            );
          })}
          <li className="flex items-center gap-3 px-5 py-3.5 bg-emerald-50/60 dark:bg-emerald-950/20">
            <span className="flex-1 text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Total des produits</span>
            <span className={`text-[17px] font-extrabold tabular-nums ${ACCENTS.emerald.value}`}>{eur(financial.totalCents)}</span>
          </li>
        </ul>
      </section>

      {/* Cadre C — Bilan pédagogique */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
          <CadreTitre icon={GraduationCap} accent="blue">
            Cadre C — Bilan pédagogique
          </CadreTitre>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
          <Row label="Nombre de stagiaires" value={String(pedago.stagiaires)} />
          <Row label="Nombre total d'heures-stagiaires" value={`${pedago.heures} h`} />
          <Row label="Nombre d'actions de formation (formations distinctes)" value={String(pedago.actions)} />
          <Row label="Nombre de dossiers de formation" value={String(pedago.dossiers)} />
        </ul>
      </section>

      {/* Cadre D — Formateurs */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200/70 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
          <CadreTitre icon={UserCog} accent="rose">
            Cadre D — Personnes dispensant les formations
          </CadreTitre>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80 text-[13px]">
          <Row label="Formateurs internes (salariés)" value={String(formateurs.internes)} />
          <Row label="Formateurs externes (sous-traitance / vacataires)" value={String(formateurs.externes)} />
          <Row label="Total formateurs intervenus" value={String(formateurs.total)} />
        </ul>
      </section>

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Chiffres calculés automatiquement à partir des factures, dossiers, sessions et formateurs de
        l&apos;année. À vérifier et reporter dans la télédéclaration officielle (sous-traitance reçue/confiée
        et ventilations fines non couvertes automatiquement).
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="flex-1 text-zinc-700 dark:text-zinc-300">{label}</span>
      <span className="tabular-nums font-bold text-zinc-900 dark:text-zinc-100">{value}</span>
    </li>
  );
}

function CadreTitre({
  icon: Icon,
  accent,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: Accent;
  children: React.ReactNode;
}) {
  return (
    <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
      <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS[accent].soft}`}>
        <Icon className="w-4 h-4" />
      </span>
      {children}
    </h2>
  );
}
