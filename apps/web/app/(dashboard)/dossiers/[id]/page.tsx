// ARCHETYPE: command
// Justification: vue 360 d'un dossier — cards d'aperçu lisibles, callout doux si bloquant, timeline d'activité.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  ArrowUpRight, ShieldAlert, ShieldCheck, FileText, Calendar, ClipboardList,
  Users as UsersIcon, Banknote,
} from 'lucide-react';

import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';
import {
  dossiers, sessionsByDossier, modulesByDossier, documentsByDossier,
  questionnairesByDossier, qualiopiByDossier, qualiopiIndicators,
  trainerFullName, funderName, formatEuros,
} from '@/shared/mock/data';

export default function DossierOverviewPage({ params }: { params: { id: string } }) {
  const dossier = dossiers.find((d) => d.id === params.id);
  if (!dossier) notFound();

  const modules = modulesByDossier[params.id] ?? [];
  const sessions = sessionsByDossier[params.id] ?? [];
  const documents = documentsByDossier[params.id] ?? [];
  const questionnaires = questionnairesByDossier[params.id] ?? [];
  const qualiopi = qualiopiByDossier[params.id] ?? [];
  const blockers = qualiopi.filter((q) => !q.satisfied && q.blocking);

  return (
    <div className="space-y-8">
      {dossier.status === 'completed' && blockers.length > 0 && (
        <InfoCallout tone="warning">
          <p className="font-medium mb-1">
            Clôture bloquée — {blockers.length} indicateur{blockers.length > 1 ? 's' : ''} Qualiopi à résoudre.
          </p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            {blockers.map((b) => qualiopiIndicators.find((i) => i.code === b.code)?.code).join(', ')} non satisfait{blockers.length > 1 ? 's' : ''}.{' '}
            <Link href={`/dossiers/${params.id}/qualiopi`} className="underline">
              Voir le détail Qualiopi
            </Link>
          </p>
        </InfoCallout>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card
          icon={ClipboardList}
          title="Modules"
          count={modules.length}
          href={`/dossiers/${params.id}/modules`}
        >
          {modules.length === 0 ? (
            <p className="text-[13px] text-zinc-500">
              Aucun module pour l'instant.{' '}
              <Link href={`/dossiers/${params.id}/modules`} className="text-zinc-700 dark:text-zinc-300 hover:underline">
                Ajouter un module
              </Link>
            </p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {modules.slice(0, 4).map((m) => (
                <li key={m.id} className="flex justify-between gap-3 items-center">
                  <span className="text-zinc-700 dark:text-zinc-300 truncate min-w-0">
                    <span className="font-mono text-[11px] text-zinc-400 mr-2">{m.position + 1}.</span>
                    {m.title}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 flex-shrink-0 tabular-nums">
                    {m.durationHours} h
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          icon={Calendar}
          title="Sessions"
          count={sessions.length}
          href={`/dossiers/${params.id}/sessions`}
        >
          {sessions.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucune session planifiée.</p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {sessions.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 w-20 flex-shrink-0">
                    {format(parseISO(s.startsAt), 'dd/MM HH:mm', { locale: fr })}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 flex-1 min-w-0 truncate">
                    {trainerFullName(s.trainerId)}
                  </span>
                  <StatusPill tone={s.status === 'done' ? 'success' : s.status === 'in_progress' ? 'warning' : 'info'}>
                    {s.status === 'done' ? 'fait' : s.status === 'in_progress' ? 'en cours' : 'à venir'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          icon={dossier.qualiopiReady ? ShieldCheck : ShieldAlert}
          iconTone={dossier.qualiopiReady ? 'success' : 'warning'}
          title="Qualiopi"
          href={`/dossiers/${params.id}/qualiopi`}
        >
          <div className="flex items-baseline gap-2 mb-3">
            <p className="text-2xl font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {dossier.qualiopiSatisfied}
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">/ {dossier.qualiopiTotal} indicateurs</p>
          </div>
          {blockers.length > 0 ? (
            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
              {blockers.slice(0, 3).map((b) => {
                const ind = qualiopiIndicators.find((i) => i.code === b.code);
                return (
                  <li key={b.code} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                    <span className="font-mono text-amber-700 dark:text-amber-400">{b.code}</span>
                    <span className="truncate">{ind?.title}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Tous les indicateurs sont satisfaits.
            </p>
          )}
        </Card>

        <Card
          icon={FileText}
          title="Documents"
          count={documents.length}
          href={`/dossiers/${params.id}/documents`}
        >
          {documents.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucun document généré.</p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {documents.slice(0, 4).map((doc) => (
                <li key={doc.id} className="flex items-center gap-2">
                  <span className="text-zinc-700 dark:text-zinc-300 truncate flex-1 min-w-0">{doc.title}</span>
                  <StatusPill tone={doc.status === 'ready' ? (doc.signed ? 'success' : 'warning') : 'neutral'}>
                    {doc.status === 'pending' ? 'en attente' : doc.signed ? 'signé' : 'à signer'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={UsersIcon} title="Formateurs">
          <ul className="text-[13px] space-y-1.5">
            {dossier.trainerIds.map((tid) => (
              <li key={tid} className="text-zinc-700 dark:text-zinc-300">
                {trainerFullName(tid)}
              </li>
            ))}
          </ul>
        </Card>

        <Card icon={Banknote} title="Financement">
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300">{funderName(dossier.funderId)}</p>
          <p className="font-mono text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mt-1.5 tabular-nums">
            {formatEuros(dossier.totalAmountCents)}
          </p>
        </Card>

        <Card
          icon={ClipboardList}
          title="Questionnaires"
          count={questionnaires.length}
          href={`/dossiers/${params.id}/questionnaires`}
        >
          {questionnaires.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Pas encore de questionnaires.</p>
          ) : (
            <ul className="text-[13px] space-y-1.5">
              {questionnaires.map((q) => (
                <li key={q.id} className="flex items-center gap-2">
                  <span className="text-zinc-700 dark:text-zinc-300 capitalize flex-1 min-w-0 truncate">
                    {q.kind.replace('_', ' ')}
                  </span>
                  <StatusPill tone={q.status === 'completed' ? 'success' : q.status === 'expired' ? 'danger' : 'warning'}>
                    {q.status === 'completed' ? 'rempli' : q.status === 'expired' ? 'expiré' : 'en attente'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={Banknote} title="Facturation" href={`/dossiers/${params.id}/facturation`}>
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
            {dossier.status === 'closed'
              ? 'Facture émise'
              : dossier.status === 'completed'
              ? 'À émettre à la clôture'
              : 'Pas encore facturable'}
          </p>
          <p className="font-mono text-[11px] text-zinc-500 mt-1">HT {formatEuros(dossier.totalAmountCents)}</p>
        </Card>
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[17px] font-medium text-zinc-900 dark:text-zinc-100">Activité du dossier</h2>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">5 derniers événements</span>
        </div>
        <ul className="border-l border-zinc-200/60 dark:border-zinc-800 pl-5 space-y-4">
          <ActivityItem date="2026-09-01 09:02" actor="Alice Martin" event="signe la convention" />
          <ActivityItem date="2026-08-30 16:42" actor="Alice Martin" event="complète le questionnaire de positionnement" />
          <ActivityItem date="2026-08-25 14:32" actor="Système" event="génère convention + convocation + programme" />
          <ActivityItem date="2026-08-25 14:30" actor="Ismaël Lepennec" event="planifie le dossier" />
          <ActivityItem date="2026-08-20 10:15" actor="Ismaël Lepennec" event="crée le dossier" />
        </ul>
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  iconTone = 'neutral',
  title,
  count,
  children,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTone?: 'neutral' | 'success' | 'warning';
  title: string;
  count?: number;
  children: React.ReactNode;
  href?: string;
}) {
  const iconColor = iconTone === 'success'
    ? 'text-emerald-600 dark:text-emerald-400'
    : iconTone === 'warning'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-zinc-400 dark:text-zinc-500';
  const iconBg = iconTone === 'success'
    ? 'bg-emerald-50 dark:bg-emerald-950/40'
    : iconTone === 'warning'
    ? 'bg-amber-50 dark:bg-amber-950/40'
    : 'bg-zinc-100 dark:bg-zinc-800/60';
  return (
    <div className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-5 py-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
          </span>
          <h2 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
            {title}
            {typeof count === 'number' && (
              <span className="text-zinc-400 dark:text-zinc-500 ml-1.5 font-normal tabular-nums">{count}</span>
            )}
          </h2>
        </div>
        {href && (
          <Link
            href={href}
            className="text-[11px] text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1 transition"
            aria-label={`Voir le détail ${title}`}
          >
            Détail <ArrowUpRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function ActivityItem({ date, actor, event }: { date: string; actor: string; event: string }) {
  return (
    <li className="text-[13px] relative">
      <span className="absolute -left-[22px] top-1.5 w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700 ring-4 ring-white dark:ring-zinc-950" />
      <p className="text-zinc-900 dark:text-zinc-100">
        {actor}{' '}
        <span className="text-zinc-500 dark:text-zinc-400 font-normal">{event}</span>
      </p>
      <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{date}</p>
    </li>
  );
}
