// ARCHETYPE: command
// Justification: home dashboard de l'OF — densité, KPIs, à-traiter, lecture rapide, zéro action principale.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, ArrowUpRight, FolderOpen, ShieldCheck, Receipt, MessageSquareWarning, FileSignature, ClipboardList } from 'lucide-react';

import { StatCard } from '@/shared/ui/stat-card';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusLabel, dossierStatusTone } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { DataList, DataRow } from '@/shared/ui/data-row';
import { KeyboardFooter } from '@/shared/ui/keyboard-footer';

import {
  dossiers, sessionsByDossier, learnerFullName, formationTitle,
  documentsByDossier, complaints, invoices, currentUser,
} from '@/shared/mock/data';

const fmtDay = (d: string) => format(parseISO(d), 'EEE dd/MM HH:mm', { locale: fr });

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
  .slice(0, 5);

const tasks = [
  ...complaints.filter((c) => c.status === 'open' || c.status === 'in_progress').map((c) => ({
    icon: MessageSquareWarning, label: `Réclamation ${c.reference} — ${c.subject}`, href: `/reclamations/${c.id}`, tone: c.severity === 'high' ? 'danger' as const : 'warning' as const, hint: `${c.daysOpen}j ouverte`,
  })),
  ...Object.entries(documentsByDossier).flatMap(([did, list]) =>
    list.filter((d) => d.status === 'ready' && !d.signed).map((d) => ({
      icon: FileSignature, label: `${d.title} non signé · ${dossiers.find((x) => x.id === did)?.reference ?? ''}`, href: `/dossiers/${did}/documents`, tone: 'warning' as const, hint: 'à relancer',
    })),
  ),
  ...invoices.filter((i) => i.status === 'overdue').map((i) => ({
    icon: Receipt, label: `Facture ${i.reference} en retard`, href: `/factures`, tone: 'danger' as const, hint: '> 30j',
  })),
].slice(0, 6);

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <header className="flex items-end justify-between mb-8">
          <div>
            <SectionLabel className="mb-1">Tableau de bord</SectionLabel>
            <h1 className="text-2xl font-medium">
              Bonjour {currentUser.full_name.split(' ')[0]}.
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
              {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })} · {kpis.active} dossier{kpis.active > 1 ? 's' : ''} actif{kpis.active > 1 ? 's' : ''} ce mois.
            </p>
          </div>
          <Link
            href="/dossiers/nouveau"
            className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Nouveau dossier
          </Link>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard
            label="Dossiers actifs"
            value={kpis.active}
            hint="↑ 2 ce mois"
          />
          <StatCard
            label="Qualiopi prêts"
            value={
              <>
                {kpis.ready}
                <span className="text-xs text-zinc-400 font-normal">/{kpis.active}</span>
              </>
            }
            hint={kpis.blocking > 0 ? `${kpis.blocking} bloquant${kpis.blocking > 1 ? 's' : ''}` : 'tous prêts'}
          />
          <StatCard
            label="Documents non signés"
            value={kpis.pendingDocs}
            hint={kpis.pendingDocs > 0 ? 'à relancer' : 'aucun'}
          />
          <StatCard
            label="Factures en retard"
            value={kpis.overdue}
            hint={kpis.overdue > 0 ? '> 30 jours' : '—'}
          />
        </section>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <section className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>Sessions à venir</SectionLabel>
              <Link href="/dossiers" className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1">
                Voir tous les dossiers <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <DataList>
              {upcomingSessions.length === 0 ? (
                <DataRow left={<span className="text-zinc-400">Aucune session planifiée</span>} right={null} />
              ) : (
                upcomingSessions.map((s) => {
                  const dossier = dossiers.find((d) => d.id === s.dossierId);
                  if (!dossier) return null;
                  return (
                    <DataRow
                      key={s.id}
                      left={
                        <Link href={`/dossiers/${dossier.id}`} className="flex items-center gap-3 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
                          <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 w-28 flex-shrink-0">
                            {fmtDay(s.startsAt)}
                          </span>
                          <span>{formationTitle(dossier.formationId)}</span>
                          <IdPill>{dossier.reference}</IdPill>
                        </Link>
                      }
                      right={
                        <span className="text-[11px] text-zinc-500">
                          {s.location ?? s.modality === 'distanciel' ? 'distanciel' : s.location}
                        </span>
                      }
                    />
                  );
                })
              )}
            </DataList>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <SectionLabel>À traiter</SectionLabel>
              <span className="text-[11px] text-zinc-500">{tasks.length}</span>
            </div>
            <DataList>
              {tasks.length === 0 ? (
                <DataRow left={<span className="text-zinc-400">Rien d'urgent</span>} right={null} />
              ) : (
                tasks.map((t, i) => {
                  const Icon = t.icon;
                  return (
                    <Link
                      key={i}
                      href={t.href}
                      className="flex items-start gap-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 -mx-2 px-2 rounded transition"
                    >
                      <Icon
                        className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${t.tone === 'danger' ? 'text-red-500' : 'text-amber-500'}`}
                      />
                      <span className="text-[13px] text-zinc-700 dark:text-zinc-300 flex-1 min-w-0 truncate">{t.label}</span>
                      <span className="text-[11px] text-zinc-400 flex-shrink-0">{t.hint}</span>
                    </Link>
                  );
                })
              )}
            </DataList>
          </section>
        </div>

        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Activité récente</SectionLabel>
            <Link href="/audit" className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1">
              Voir tout l'audit <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <DataList>
            {dossiers.slice(0, 6).map((d) => {
              const learner = learnerFullName(d.learnerId);
              return (
                <DataRow
                  key={d.id}
                  left={
                    <Link href={`/dossiers/${d.id}`} className="flex items-center gap-3 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
                      <IdPill>{d.reference}</IdPill>
                      <span>{learner}</span>
                      <span className="text-zinc-400">·</span>
                      <span className="text-zinc-500 dark:text-zinc-400 truncate">{formationTitle(d.formationId)}</span>
                    </Link>
                  }
                  right={
                    <StatusPill tone={dossierStatusTone(d.status)}>
                      {dossierStatusLabel(d.status)}
                    </StatusPill>
                  }
                />
              );
            })}
          </DataList>
        </section>
      </div>

      <KeyboardFooter shortcuts="⌘K palette · ⌘N nouveau dossier · ⌘D liste dossiers · ↑↓ naviguer" />
    </div>
  );
}
