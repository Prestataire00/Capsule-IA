// ARCHETYPE: command
// Justification: Bilan Pédagogique et Financier (BPF — Cerfa 10443). Calcul auto
// des cadres B (produits ventilés), C (pédagogique), D (formateurs) pour une année,
// en vue de la télédéclaration. Lecture seule + impression.
import Link from 'next/link';
import { TrendingUp, Users, Clock, UserCog } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatCard } from '@/shared/ui/stat-card';
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

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-8 space-y-6 print:py-2">
      <header className="flex items-end justify-between gap-4 flex-wrap print:block">
        <div>
          <SectionLabel className="mb-1">Qualité · Réglementaire</SectionLabel>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Bilan Pédagogique et Financier {year}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Cerfa 10443 — aide au remplissage de la télédéclaration (DREETS). Produits HT des factures
            émises dans l&apos;année.
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-1">
            {years.map((y) => (
              <Link
                key={y}
                href={`/bpf?year=${y}`}
                className={`px-3 py-1 rounded-md text-[13px] font-medium transition ${
                  y === year
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
          <PrintButton year={year} />
        </div>
      </header>

      {/* KPI de synthèse de l'année */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Produits HT"
          value={eur(financial.totalCents)}
          icon={TrendingUp}
          accent="emerald"
          hint={`${pedago.dossiers} dossier${pedago.dossiers > 1 ? 's' : ''} · ${pedago.actions} action${pedago.actions > 1 ? 's' : ''}`}
          hintTone="neutral"
        />
        <StatCard
          label="Stagiaires"
          value={pedago.stagiaires}
          icon={Users}
          accent="blue"
          hint="distincts sur l'année"
          hintTone="neutral"
        />
        <StatCard
          label="Heures dispensées"
          value={`${pedago.heures} h`}
          icon={Clock}
          accent="violet"
          hint="total heures des dossiers"
          hintTone="neutral"
        />
        <StatCard
          label="Formateurs intervenus"
          value={formateurs.total}
          icon={UserCog}
          accent="amber"
          hint={`${formateurs.internes} interne${formateurs.internes > 1 ? 's' : ''} · ${formateurs.externes} externe${formateurs.externes > 1 ? 's' : ''}`}
          hintTone="neutral"
        />
      </section>

      {/* Cadre B — Bilan financier (produits) */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            Cadre B — Bilan financier (origine des produits, HT)
          </h2>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {BPF_LINES.map((l) => (
            <li key={l.key} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <span className="font-mono text-[10px] text-zinc-400 w-12">{l.code}</span>
              <span className="flex-1 text-zinc-700 dark:text-zinc-300">{l.label}</span>
              <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{eur(financial.lines[l.key])}</span>
            </li>
          ))}
          <li className="flex items-center gap-3 px-5 py-3 text-[14px] font-semibold bg-zinc-50/60 dark:bg-zinc-950/40">
            <span className="flex-1 text-zinc-900 dark:text-zinc-100">Total des produits</span>
            <span className="tabular-nums text-violet-700 dark:text-violet-400">{eur(financial.totalCents)}</span>
          </li>
        </ul>
      </section>

      {/* Cadre C — Bilan pédagogique */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Cadre C — Bilan pédagogique</h2>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-[13px]">
          <Row label="Nombre de stagiaires" value={String(pedago.stagiaires)} />
          <Row label="Nombre total d'heures-stagiaires" value={`${pedago.heures} h`} />
          <Row label="Nombre d'actions de formation (formations distinctes)" value={String(pedago.actions)} />
          <Row label="Nombre de dossiers de formation" value={String(pedago.dossiers)} />
        </ul>
      </section>

      {/* Cadre D — Formateurs */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            Cadre D — Personnes dispensant les formations
          </h2>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-[13px]">
          <Row label="Formateurs internes (salariés)" value={String(formateurs.internes)} />
          <Row label="Formateurs externes (sous-traitance / vacataires)" value={String(formateurs.externes)} />
          <Row label="Total formateurs intervenus" value={String(formateurs.total)} />
        </ul>
      </section>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        Chiffres calculés automatiquement à partir des factures, dossiers, sessions et formateurs de
        l&apos;année. À vérifier et reporter dans la télédéclaration officielle (sous-traitance reçue/confiée
        et ventilations fines non couvertes automatiquement).
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span className="flex-1 text-zinc-700 dark:text-zinc-300">{label}</span>
      <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{value}</span>
    </li>
  );
}
