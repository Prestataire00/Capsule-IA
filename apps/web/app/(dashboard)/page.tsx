// ARCHETYPE: command
// Justification: home dashboard chaleureuse — accueil personnalisé, hiérarchie claire, scan rapide.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Plus, ArrowUpRight, FolderOpen, ShieldCheck, Receipt, MessageSquareWarning,
  FileSignature, Calendar, AlertCircle, ShieldAlert, Sparkles,
} from 'lucide-react';

import { StatCard } from '@/shared/ui/stat-card';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';

import {
  dossiers, sessionsByDossier, learnerFullName, formationTitle, trainerFullName,
  documentsByDossier, complaints, invoices, currentUser,
} from '@/shared/mock/data';

const greet = () => {
  const h = new Date().getHours();
  if (h < 6) return 'Bonsoir';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bel après-midi';
  return 'Bonsoir';
};

const kpis = (() => {
  const active = dossiers.filter((d) => d.status === 'active').length;
  const ready = dossiers.filter((d) => d.qualiopiReady && (d.status === 'active' || d.status === 'completed')).length;
  const blocking = dossiers.filter((d) => d.qualiopiBlocking > 0 && (d.status === 'active' || d.status === 'completed')).length;
  const pendingDocs = Object.values(documentsByDossier).flat().filter((doc) => doc.status === 'ready' && !doc.signed).length;
  const overdue = invoices.filter((i) => i.status === 'overdue').length;
  return { active, ready, blocking, pendingDocs, overdue };
})();

const upcomingSessions = Object.entries(sessionsByDossier)
  .flatMap(([dossierId, list]) =>
    list.filter((s) => s.status === 'planned' || s.status === 'in_progress')
        .map((s) => ({ ...s, dossierId })),
  )
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  .slice(0, 4);

type TaskTone = 'danger' | 'warning' | 'info';
type Task = {
  icon: React.ComponentType<{ className?: string }>;
  label: string; href: string; tone: TaskTone; hint: string;
};

const tasks: Task[] = [
  ...complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').map((c) => ({
    icon: MessageSquareWarning, label: `Réclamation ${c.reference} · ${c.subject}`, href: `/reclamations`,
    tone: (c.severity === 'high' ? 'danger' : 'warning') as TaskTone, hint: `${c.daysOpen}j ouverte`,
  })),
  ...Object.entries(documentsByDossier).flatMap(([did, list]) =>
    list.filter((d) => d.status === 'ready' && !d.signed).map((d) => ({
      icon: FileSignature, label: `${d.title} · ${dossiers.find((x) => x.id === did)?.reference ?? ''}`,
      href: `/dossiers/${did}/documents`, tone: 'warning' as TaskTone, hint: 'à relancer',
    })),
  ),
  ...invoices.filter((i) => i.status === 'overdue').map((i) => ({
    icon: Receipt, label: `Facture ${i.reference} en retard`, href: `/factures`,
    tone: 'danger' as TaskTone, hint: '> 30j',
  })),
].slice(0, 6);

const toneStyles = {
  danger: { iconBg: 'bg-red-50 dark:bg-red-950/40', iconColor: 'text-red-600 dark:text-red-400' },
  warning: { iconBg: 'bg-amber-50 dark:bg-amber-950/40', iconColor: 'text-amber-600 dark:text-amber-400' },
  info: { iconBg: 'bg-blue-50 dark:bg-blue-950/40', iconColor: 'text-blue-600 dark:text-blue-400' },
};

export default function Home() {
  const firstName = currentUser.full_name.split(' ')[0];
  const today = new Date();

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="max-w-6xl w-full mx-auto px-8 py-10">

        <header className="mb-12">
          <p className="text-[11px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 mb-2">
            {format(today, 'EEEE d MMMM yyyy', { locale: fr })}
          </p>
          <h1 className="text-2xl font-medium text-zinc-900 dark:text-zinc-100">
            {greet()}, {firstName}.
          </h1>
          <p className="text-[15px] text-zinc-600 dark:text-zinc-400 mt-2 max-w-2xl">
            {kpis.active > 0
              ? `${kpis.active} dossier${kpis.active > 1 ? 's' : ''} en cours, ${upcomingSessions.length} session${upcomingSessions.length > 1 ? 's' : ''} à venir cette semaine. Voici ce qui demande votre attention.`
              : "Tout est calme aujourd'hui. C'est le bon moment pour ouvrir un nouveau dossier."}
          </p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
          <StatCard
            label="Dossiers actifs"
            value={kpis.active}
            icon={FolderOpen}
            hint="↑ 2 ce mois"
            hintTone="success"
          />
          <StatCard
            label="Qualiopi prêts"
            value={
              <>
                {kpis.ready}
                <span className="text-[15px] text-zinc-400 dark:text-zinc-500 font-normal ml-1">/ {kpis.active}</span>
              </>
            }
            icon={ShieldCheck}
            hint={kpis.blocking > 0 ? `${kpis.blocking} bloquant${kpis.blocking > 1 ? 's' : ''}` : 'tous prêts'}
            hintTone={kpis.blocking > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label="Documents à signer"
            value={kpis.pendingDocs}
            icon={FileSignature}
            hint={kpis.pendingDocs > 0 ? 'à relancer' : 'tout est signé'}
            hintTone={kpis.pendingDocs > 0 ? 'warning' : 'success'}
          />
          <StatCard
            label="Factures en retard"
            value={kpis.overdue}
            icon={Receipt}
            hint={kpis.overdue > 0 ? '> 30 jours' : 'aucune'}
            hintTone={kpis.overdue > 0 ? 'danger' : 'success'}
          />
        </section>

        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">Prochaines sessions</h2>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Les sessions planifiées cette semaine et la suivante.
              </p>
            </div>
            <Link
              href="/dossiers"
              className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 transition"
            >
              Tous les dossiers
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {upcomingSessions.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-12 text-center">
              <Calendar className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune session planifiée.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {upcomingSessions.map((s) => {
                const dossier = dossiers.find((d) => d.id === s.dossierId);
                if (!dossier) return null;
                return (
                  <Link
                    key={s.id}
                    href={`/dossiers/${dossier.id}`}
                    className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400">
                          {format(parseISO(s.startsAt), 'EEEE d MMMM', { locale: fr })}
                        </p>
                        <p className="font-mono text-[13px] text-zinc-900 dark:text-zinc-100 mt-0.5">
                          {format(parseISO(s.startsAt), 'HH:mm')} – {format(parseISO(s.endsAt), 'HH:mm')}
                        </p>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition" />
                    </div>
                    <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {formationTitle(dossier.formationId)}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Avatar name={trainerFullName(s.trainerId)} />
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 flex-1 truncate">
                        {trainerFullName(s.trainerId)}
                      </p>
                      <IdPill>{dossier.reference}</IdPill>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid lg:grid-cols-2 gap-6 mb-12">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">À traiter</h2>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{tasks.length}</span>
            </div>
            {tasks.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-10 text-center">
                <div className="inline-flex w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 items-center justify-center mb-2">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-[13px] text-zinc-700 dark:text-zinc-300">Rien d'urgent.</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">Belle journée pour avancer en profondeur.</p>
              </div>
            ) : (
              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
                {tasks.map((t, i) => {
                  const Icon = t.icon;
                  const styles = toneStyles[t.tone];
                  return (
                    <li key={i}>
                      <Link
                        href={t.href}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group"
                      >
                        <span className={`w-7 h-7 rounded-full ${styles.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Icon className={`w-3.5 h-3.5 ${styles.iconColor}`} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <p className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{t.label}</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{t.hint}</p>
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition flex-shrink-0 mt-1" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">Dossiers récents</h2>
              <Link
                href="/dossiers"
                className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 transition"
              >
                Tout voir
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {dossiers.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group"
                  >
                    <Avatar name={learnerFullName(d.learnerId)} />
                    <span className="flex-1 min-w-0">
                      <p className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">
                        {learnerFullName(d.learnerId)}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {formationTitle(d.formationId)}
                      </p>
                    </span>
                    <StatusPill tone={dossierStatusTone(d.status)}>
                      {dossierStatusLabel(d.status)}
                    </StatusPill>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="bg-zinc-100/60 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-6 flex items-start gap-4">
          <span className="w-10 h-10 rounded-full bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-center flex-shrink-0">
            <Plus className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
          </span>
          <div className="flex-1">
            <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
              Vous avez un nouveau dossier à créer&nbsp;?
            </p>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
              3 étapes guidées : apprenant + formation, modules + formateur, financement. Le brouillon est sauvegardé automatiquement.
            </p>
          </div>
          <Link
            href="/dossiers/nouveau"
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center gap-2 flex-shrink-0"
          >
            Créer un dossier
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </section>

      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const palette = ['bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium flex-shrink-0 ${palette[idx]}`}>
      {initials}
    </span>
  );
}
