// ARCHETYPE: command
// Justification: home dashboard convivial style Notion/Linear — hero personnalisé + KPI multi-couleurs + charts SVG + à-traiter + table dossiers + Qualiopi card.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowUpRight, FolderOpen, Clock, GraduationCap, BarChart3,
  FileSignature, ClipboardCheck, ClipboardList, Calendar, Check, FileText,
} from 'lucide-react';

import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { DonutChart, DonutLegend } from '@/shared/ui/donut-chart';
import { LineChart } from '@/shared/ui/line-chart';
import { ProgressBar } from '@/shared/ui/progress-bar';

import {
  dossiers, learnerFullName, formationTitle, companyName, currentUser,
} from '@/shared/mock/data';

import { supabaseServer } from '@/shared/lib/supabase/server';
import { getOrgKpis } from '@/features/reports/org-kpis.query';

const greet = () => {
  const h = new Date().getHours();
  if (h < 6) return 'Bonsoir';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bel après-midi';
  return 'Bonsoir';
};

const fundersData = [
  { label: 'OPCO', value: 42, color: '#7c3aed' },         // violet-600
  { label: 'FAF-CEA', value: 28, color: '#10b981' },      // emerald-500
  { label: 'AGEFIPH', value: 15, color: '#f59e0b' },      // amber-500
  { label: 'Entreprise', value: 10, color: '#fb923c' },   // orange-400
  { label: 'Autres', value: 5, color: '#a1a1aa' },        // zinc-400
];

const activityPoints = [12, 18, 22, 19, 28, 32, 38];
const activityLabels = ['12/05', '13/05', '14/05', '15/05', '16/05', '17/05', '18/05'];

const taskColors = {
  violet: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-600 dark:text-violet-400' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-600 dark:text-blue-400' },
  rose: { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-600 dark:text-rose-400' },
};

const qualiopiPoints = [
  { label: 'Indicateurs renseignés', ok: true },
  { label: 'Documents à jour', ok: true },
  { label: 'Processus validés', ok: true },
  { label: 'Audit interne OK', ok: true },
];

export default async function Home() {
  const kpis = await getOrgKpis(supabaseServer());
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const tasks = [
    { icon: FileSignature, label: 'Documents à signer', count: kpis.toSign, href: '/documents', color: 'violet' as const },
    { icon: ClipboardCheck, label: 'Émargements manquants', count: kpis.attendanceMissing, href: '/dossiers', color: 'amber' as const },
    { icon: ClipboardList, label: 'Questionnaires à compléter', count: kpis.questionnairesPending, href: '/dossiers', color: 'blue' as const },
  ];
  const firstName = currentUser.full_name.split(' ')[0];
  const today = new Date();
  const start = format(today, 'd MMM', { locale: fr });
  const end = format(new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000), 'd MMM yyyy', { locale: fr });

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {greet()} {firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1.5">
            Voici l'activité de votre organisme aujourd'hui.
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 inline-flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 shadow-sm">
          <Calendar className="w-3.5 h-3.5 text-zinc-400" />
          {start} – {end}
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard href="/dossiers" label="Dossiers actifs" value={kpis.dossiersActive} icon={FolderOpen} accent="purple" />
        <StatCard href="/factures" label="CA en cours" value={euro.format(kpis.revenueInProgressCents / 100)} icon={Clock} accent="emerald" />
        <StatCard href="/dossiers" label="Clôturés ce mois" value={kpis.dossiersClosedThisMonth} icon={GraduationCap} accent="blue" />
        <StatCard href="/qualiopi" label="Taux Qualiopi" value={`${Math.round(kpis.qualiopiRate * 100)}%`} icon={BarChart3} accent="amber" />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
        <section className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Répartition des dossiers par financeur
          </h2>
          <div className="flex items-center gap-5">
            <DonutChart data={fundersData} size={150} strokeWidth={22} />
            <div className="flex-1 min-w-0">
              <DonutLegend data={fundersData} />
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Activité des 7 derniers jours
          </h2>
          <LineChart points={activityPoints} labels={activityLabels} height={150} />
        </section>

        <section className="lg:col-span-3 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            À traiter
          </h2>
          <ul className="space-y-2">
            {tasks.map((t) => {
              const Icon = t.icon;
              const c = taskColors[t.color];
              return (
                <li key={t.label}>
                  <Link
                    href={t.href}
                    className="flex items-center gap-3 px-2 py-1.5 -mx-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group"
                  >
                    <span className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${c.text}`} />
                    </span>
                    <span className="flex-1 text-[13px] text-zinc-700 dark:text-zinc-300 truncate">{t.label}</span>
                    <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{t.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Dossiers récents</h2>
            <Link href="/dossiers" className="text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 inline-flex items-center gap-1 transition">
              Voir tous les dossiers
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div>
            <div className="grid grid-cols-[110px_1fr_1fr_1fr_100px_120px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
              <div>Dossier</div>
              <div>Apprenant</div>
              <div>Formation</div>
              <div>Entreprise</div>
              <div>Statut</div>
              <div>Avancement</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {dossiers.slice(0, 5).map((d) => {
                const completion = d.sessionsCount > 0 ? Math.round((d.sessionsDone / d.sessionsCount) * 100) : 0;
                return (
                  <li key={d.id}>
                    <Link
                      href={`/dossiers/${d.id}`}
                      className="grid grid-cols-[110px_1fr_1fr_1fr_100px_120px] gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition items-center"
                    >
                      <IdPill>{d.reference}</IdPill>
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={learnerFullName(d.learnerId)} />
                        <span className="text-zinc-900 dark:text-zinc-100 truncate">{learnerFullName(d.learnerId)}</span>
                      </div>
                      <span className="text-zinc-700 dark:text-zinc-300 truncate">{formationTitle(d.formationId)}</span>
                      <span className="text-zinc-500 dark:text-zinc-400 truncate">{companyName(d.companyId) ?? '—'}</span>
                      <StatusPill tone={dossierStatusTone(d.status)}>
                        {dossierStatusLabel(d.status)}
                      </StatusPill>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={completion} tone={completion === 100 ? 'emerald' : 'violet'} size="sm" />
                        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums w-9 text-right">
                          {completion}%
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Conformité Qualiopi</h2>
          </div>
          <div className="flex items-center gap-5">
            <DonutChart
              data={[{ label: 'Conforme', value: 92, color: '#10b981' }, { label: 'Restant', value: 8, color: '#e4e4e7' }]}
              size={120}
              strokeWidth={16}
              centerTitle={<span>92%</span>}
              centerSubtitle={<span className="text-emerald-600">Conforme</span>}
            />
            <ul className="flex-1 space-y-2 text-[12px]">
              {qualiopiPoints.map((p) => (
                <li key={p.label} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                  <span className="truncate">{p.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-4 mb-3">
            Dernière mise à jour : 10/05/2026
          </p>
          <Link
            href="/qualiopi"
            className="block w-full text-center bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-950/60 text-violet-700 dark:text-violet-300 text-[13px] font-medium px-4 py-2 rounded-lg transition"
          >
            Voir le tableau de bord Qualiopi
          </Link>
        </section>
      </div>

      {/* Section Documents + Parcours apprenant en cours */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-6">
        <DocumentsSection />
        <ParcoursSection />
      </div>
    </div>
  );
}

function DocumentsSection() {
  const tabs = [
    { id: 'a-signer', label: 'À signer', count: 18, active: true },
    { id: 'a-transmettre', label: 'À transmettre', count: 12 },
    { id: 'generes', label: 'Générés', count: 132 },
    { id: 'archives', label: 'Archivés' },
  ];
  const docs = [
    { name: 'Convention de formation', dossier: 'DOS-2026-0128', learner: 'Thomas Martin', type: 'Convention', status: 'À signer', action: 'Signer', actionTone: 'violet' as const },
    { name: 'Programme de formation', dossier: 'DOS-2026-0128', learner: 'Thomas Martin', type: 'Programme', status: 'À transmettre', action: 'Envoyer', actionTone: 'amber' as const },
    { name: 'Règlement intérieur', dossier: 'DOS-2026-0128', learner: 'Thomas Martin', type: 'Interne', status: 'À signer', action: 'Signer', actionTone: 'violet' as const },
    { name: 'Attestation assiduité', dossier: 'DOS-2026-0127', learner: 'Sophie Bernard', type: 'Attestation', status: 'Généré', action: 'Télécharger', actionTone: 'zinc' as const },
    { name: 'Certificat de réalisation', dossier: 'DOS-2026-0126', learner: 'Julien Moreau', type: 'Certificat', status: 'Généré', action: 'Télécharger', actionTone: 'zinc' as const },
  ];
  const actionStyles = {
    violet: 'text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300',
    amber: 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300',
    zinc: 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100',
  };
  const statusStyles: Record<string, string> = {
    'À signer': 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
    'À transmettre': 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    'Généré': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  };
  return (
    <section className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Documents</h2>
        <Link
          href="/documents"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-3.5 py-1.5 rounded-lg transition shadow-sm inline-flex items-center gap-1.5"
        >
          <span aria-hidden="true">+</span> Générer un document
        </Link>
      </div>
      <div className="px-5 pt-3 border-b border-zinc-200/60 dark:border-zinc-800">
        <ul className="flex items-center gap-1">
          {tabs.map((t) => (
            <li key={t.id}>
              <Link
                href={`/documents?tab=${t.id}`}
                className={
                  t.active
                    ? 'text-[13px] font-medium text-violet-700 dark:text-violet-400 border-b-2 border-violet-600 px-3 py-2 -mb-px transition inline-block'
                    : 'text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2 transition inline-block'
                }
              >
                {t.label}
                {typeof t.count === 'number' && (
                  <span className={t.active ? 'ml-1.5 text-[11px] bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 px-1.5 py-0.5 rounded' : 'ml-1.5 text-[11px] text-zinc-400'}>
                    {t.count}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {docs.map((d, i) => (
          <li key={i}>
            <Link
              href="/documents"
              className="grid grid-cols-[24px_1fr_120px_100px_100px_120px_90px] gap-3 px-5 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group"
            >
              <span className="w-7 h-7 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </span>
              <span className="text-zinc-900 dark:text-zinc-100 truncate">{d.name}</span>
              <IdPill className="!text-[10px]">{d.dossier}</IdPill>
              <span className="text-zinc-700 dark:text-zinc-300 truncate">{d.learner}</span>
              <span className="text-zinc-500 dark:text-zinc-400 truncate">{d.type}</span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center w-fit ${statusStyles[d.status] ?? 'bg-zinc-100 text-zinc-700'}`}>
                {d.status}
              </span>
              <span className={`text-[12px] font-medium text-right transition ${actionStyles[d.actionTone]} group-hover:underline`}>
                {d.action}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 border-t border-zinc-200/60 dark:border-zinc-800 text-right">
        <Link href="/dossiers" className="text-[12px] text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 inline-flex items-center gap-1 transition">
          Voir tous les documents <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}

function ParcoursSection() {
  const modules = [
    { num: 1, title: 'Les fondamentaux', status: 'done', subtitle: '' },
    { num: 2, title: 'Techniques avancées', status: 'active', subtitle: 'Approfondissez vos compétences en ingénierie de prompts avancée.', subitems: [
      { label: '2.1 Chaînes de pensée', meta: 'Vidéo · 45 min', state: 'done' },
      { label: '2.2 Structures de prompts', meta: 'Vidéo · 50 min', state: 'active' },
      { label: '2.3 Mise en pratique', meta: 'Exercice · 30 min', state: 'todo' },
      { label: '2.4 Quiz', meta: 'Quiz · 20 min', state: 'todo' },
    ] },
    { num: 3, title: 'Applications pratiques', status: 'todo' },
    { num: 4, title: 'Projet final', status: 'todo' },
  ];
  return (
    <section className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <Link href="/dossiers" className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800 block hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group">
        <div className="flex items-center justify-between">
          <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">Parcours apprenant en cours</p>
          <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-600 transition" />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium text-[12px] flex items-center justify-center flex-shrink-0">SB</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">Sophie Bernard</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">sophie.bernard@email.com</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-[11px]">
          <div className="bg-zinc-50 dark:bg-zinc-950 rounded-md px-2.5 py-2">
            <p className="text-zinc-500 dark:text-zinc-400 mb-0.5">Formation</p>
            <p className="text-zinc-900 dark:text-zinc-100 font-medium truncate">Prompt Engineering</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-950 rounded-md px-2.5 py-2 flex items-center gap-2">
            <DonutChart data={[{ label: 'p', value: 40, color: '#10b981' }, { label: 'r', value: 60, color: '#e4e4e7' }]} size={32} strokeWidth={5} />
            <div>
              <p className="text-zinc-500 dark:text-zinc-400 mb-0.5">Progression</p>
              <p className="text-emerald-600 dark:text-emerald-500 font-medium">40%</p>
            </div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-950 rounded-md px-2.5 py-2">
            <p className="text-zinc-500 dark:text-zinc-400 mb-0.5">Heures réalisées</p>
            <p className="text-zinc-900 dark:text-zinc-100 font-medium">14h <span className="text-zinc-400 font-normal">/ 35h</span></p>
          </div>
        </div>
      </Link>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {modules.map((m) => (
          <li key={m.num}>
            <div className={
              m.status === 'active'
                ? 'px-5 py-3 bg-violet-50/40 dark:bg-violet-950/10'
                : 'px-5 py-3'
            }>
              <div className="flex items-center justify-between">
                <p className={
                  m.status === 'done'
                    ? 'text-[13px] text-zinc-500 dark:text-zinc-500 line-through truncate'
                    : m.status === 'active'
                    ? 'text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate'
                    : 'text-[13px] text-zinc-500 dark:text-zinc-400 truncate'
                }>
                  Module {m.num} — {m.title}
                </p>
                <span className={
                  m.status === 'done'
                    ? 'text-[11px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium'
                    : m.status === 'active'
                    ? 'text-[11px] bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 px-2 py-0.5 rounded-full font-medium'
                    : 'text-[11px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium'
                }>
                  {m.status === 'done' ? 'Terminé' : m.status === 'active' ? 'En cours' : 'À venir'}
                </span>
              </div>
              {m.subtitle && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">{m.subtitle}</p>
              )}
              {m.subitems && (
                <ul className="mt-3 space-y-1.5 pl-1">
                  {m.subitems.map((s, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-[12px]">
                      <span className={
                        s.state === 'done'
                          ? 'w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0'
                          : s.state === 'active'
                          ? 'w-4 h-4 rounded-full bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0'
                          : 'w-4 h-4 rounded-full border border-zinc-200 dark:border-zinc-800 flex items-center justify-center flex-shrink-0'
                      }>
                        {s.state === 'done' && <Check className="w-2.5 h-2.5" />}
                        {s.state === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                      </span>
                      <span className="text-zinc-700 dark:text-zinc-300 flex-1 truncate">{s.label}</span>
                      <span className="text-zinc-400 dark:text-zinc-500 text-[10px] font-mono">{s.meta}</span>
                      <span className={
                        s.state === 'done'
                          ? 'text-[10px] text-emerald-600 dark:text-emerald-500'
                          : s.state === 'active'
                          ? 'text-[10px] text-violet-600 dark:text-violet-500'
                          : 'text-[10px] text-zinc-400'
                      }>
                        {s.state === 'done' ? 'Terminé' : s.state === 'active' ? 'En cours' : 'À faire'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const palette = [
    'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  ];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${palette[idx]}`}>
      {initials}
    </span>
  );
}
