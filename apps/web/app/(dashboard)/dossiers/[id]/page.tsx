// ARCHETYPE: command
// Justification: vue 360 d'un dossier — synthèse dense en cards d'aperçu avec liens vers les tabs détaillés.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowUpRight, ShieldAlert, ShieldCheck } from 'lucide-react';

import { SectionLabel } from '@/shared/ui/section-label';
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
    <div className="space-y-6">
      {dossier.status === 'completed' && blockers.length > 0 && (
        <InfoCallout tone="warning">
          <p className="font-medium mb-1">Clôture bloquée — {blockers.length} indicateur{blockers.length > 1 ? 's' : ''} Qualiopi à résoudre.</p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            {blockers.map((b) => qualiopiIndicators.find((i) => i.code === b.code)?.code).join(', ')} non satisfaits.{' '}
            <Link href={`/dossiers/${params.id}/qualiopi`} className="underline">
              Voir le détail Qualiopi
            </Link>
          </p>
        </InfoCallout>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`Modules (${modules.length})`} href={`/dossiers/${params.id}/modules`}>
          {modules.length === 0 ? (
            <p className="text-[13px] text-zinc-400">Aucun module. <Link href={`/dossiers/${params.id}/modules`} className="text-zinc-600 dark:text-zinc-300 hover:underline">Ajouter</Link></p>
          ) : (
            <ul className="text-[13px] space-y-1">
              {modules.slice(0, 4).map((m) => (
                <li key={m.id} className="flex justify-between">
                  <span className="text-zinc-700 dark:text-zinc-300 truncate min-w-0 mr-2">
                    <span className="font-mono text-[11px] text-zinc-400 mr-2">{m.position + 1}.</span>
                    {m.title}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 flex-shrink-0">{m.durationHours}h</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Sessions (${sessions.length})`} href={`/dossiers/${params.id}/sessions`}>
          {sessions.length === 0 ? (
            <p className="text-[13px] text-zinc-400">Aucune session planifiée.</p>
          ) : (
            <ul className="text-[13px] space-y-1">
              {sessions.slice(0, 4).map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-500 flex-shrink-0">
                    {format(parseISO(s.startsAt), 'dd/MM HH:mm', { locale: fr })}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 flex-1 min-w-0 truncate">
                    {trainerFullName(s.trainerId)}
                  </span>
                  <StatusPill tone={s.status === 'done' ? 'success' : s.status === 'in_progress' ? 'warning' : 'info'}>
                    {s.status === 'done' ? 'fait' : s.status === 'in_progress' ? 'en cours' : 'planifié'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Qualiopi" href={`/dossiers/${params.id}/qualiopi`}>
          <div className="flex items-center gap-3 mb-3">
            {dossier.qualiopiReady ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            )}
            <p className="text-[15px] font-medium">
              {dossier.qualiopiSatisfied}/{dossier.qualiopiTotal} indicateurs
            </p>
          </div>
          {blockers.length > 0 ? (
            <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-0.5">
              {blockers.slice(0, 3).map((b) => {
                const ind = qualiopiIndicators.find((i) => i.code === b.code);
                return (
                  <li key={b.code} className="flex items-center gap-2">
                    <span className="font-mono text-zinc-400">{b.code}</span>
                    <span className="truncate">{ind?.title}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] text-emerald-600">Tous les indicateurs sont satisfaits.</p>
          )}
        </Card>

        <Card title={`Documents (${documents.length})`} href={`/dossiers/${params.id}/documents`}>
          {documents.length === 0 ? (
            <p className="text-[13px] text-zinc-400">Aucun document.</p>
          ) : (
            <ul className="text-[13px] space-y-1">
              {documents.slice(0, 4).map((doc) => (
                <li key={doc.id} className="flex justify-between gap-2">
                  <span className="text-zinc-700 dark:text-zinc-300 truncate flex-1 min-w-0">{doc.title}</span>
                  <StatusPill tone={doc.status === 'ready' ? (doc.signed ? 'success' : 'warning') : 'neutral'}>
                    {doc.status === 'pending' ? 'en attente' : doc.signed ? 'signé' : 'à signer'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Formateurs">
          <ul className="text-[13px] space-y-1">
            {dossier.trainerIds.map((tid) => (
              <li key={tid} className="text-zinc-700 dark:text-zinc-300">
                {trainerFullName(tid)}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Financement">
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300">{funderName(dossier.funderId)}</p>
          <p className="font-mono text-[11px] text-zinc-500 mt-1">{formatEuros(dossier.totalAmountCents)}</p>
        </Card>

        <Card title={`Questionnaires (${questionnaires.length})`} href={`/dossiers/${params.id}/questionnaires`}>
          {questionnaires.length === 0 ? (
            <p className="text-[13px] text-zinc-400">Pas encore de questionnaires.</p>
          ) : (
            <ul className="text-[13px] space-y-1">
              {questionnaires.map((q) => (
                <li key={q.id} className="flex justify-between gap-2">
                  <span className="text-zinc-700 dark:text-zinc-300 capitalize">{q.kind.replace('_', ' ')}</span>
                  <StatusPill tone={q.status === 'completed' ? 'success' : q.status === 'expired' ? 'danger' : 'warning'}>
                    {q.status === 'completed' ? 'rempli' : q.status === 'expired' ? 'expiré' : 'en attente'}
                  </StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Facturation" href={`/dossiers/${params.id}/facturation`}>
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
            {dossier.status === 'closed' ? 'Facture émise' : dossier.status === 'completed' ? 'À émettre à la clôture' : 'Pas encore facturable'}
          </p>
          <p className="font-mono text-[11px] text-zinc-500 mt-1">
            HT · {formatEuros(dossier.totalAmountCents)}
          </p>
        </Card>
      </div>

      <section className="mt-6">
        <SectionLabel className="mb-3">Activité du dossier</SectionLabel>
        <ul className="border-l border-zinc-200/60 dark:border-zinc-800 pl-4 space-y-3">
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
  title, children, href,
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{title}</h2>
        {href && (
          <Link href={href} className="text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1 transition">
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
    <li className="text-[13px] text-zinc-700 dark:text-zinc-300 relative">
      <span className="absolute -left-[18px] top-1.5 w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
      <span className="font-mono text-[11px] text-zinc-400 mr-2">{date}</span>
      <span className="text-zinc-900 dark:text-zinc-100">{actor}</span>{' '}
      <span className="text-zinc-500">{event}</span>
    </li>
  );
}
