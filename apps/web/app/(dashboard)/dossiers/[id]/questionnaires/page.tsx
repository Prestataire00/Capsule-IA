// ARCHETYPE: command
// Justification: questionnaires du dossier — affectation apprenant, saisie manuelle, export PDF, financeur.

import Link from 'next/link';
import { ClipboardPen, FileText, UserRound, Landmark, GraduationCap, Building2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { SendFunder } from './send-funder';
import { AssignLearner } from './assign-learner';
import { SendTrainer } from './send-trainer';
import { SendCompany } from './send-company';
import { Relancer } from './relancer.client';

const KIND_LABEL: Record<string, string> = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  evaluation_acquis: 'Évaluation des acquis',
  satisfaction_formateur: 'Satisfaction formateur',
  opco: 'OPCO',
  custom: 'Personnalisé',
};

// Types de questionnaires affectables à un apprenant (le financeur a son propre flux).
const LEARNER_KINDS = new Set([
  'positionnement',
  'satisfaction_chaud',
  'satisfaction_froid',
  'evaluation_acquis',
  'custom',
]);

/** Une ligne de suivi : ce qui est parti, quand, et si l'on a eu réponse. */
type Suivi = {
  id: string;
  status: string;
  recipient_name: string | null;
  created_at: string;
  template_id: string;
};

type LearnerAssignment = {
  id: string;
  status: string;
  recipient_kind: string;
  template: { kind: string; title: string } | null;
};

export default async function QuestionnairesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const [{ data: assignData }, { data: tplData }, { data: funderLinks }] = await Promise.all([
    sb
      .schema('app')
      .from('questionnaire_assignments')
      .select('id, status, recipient_kind, template:questionnaire_templates(kind, title)')
      .eq('dossier_id', params.id)
      .eq('recipient_kind', 'learner' as never),
    sb
      .schema('app')
      .from('questionnaire_templates')
      .select('id, title, kind')
      .is('deleted_at', null)
      .order('title', { ascending: true }),
    sb.schema('app').from('dossier_funders').select('funder:funders(id, name)').eq('dossier_id', params.id),
  ]);

  const learnerAssignments = (assignData as unknown as LearnerAssignment[] | null) ?? [];

  const templates = (
    (tplData as { id: string; title: string; kind: string }[] | null) ?? []
  ).filter((t) => LEARNER_KINDS.has(t.kind));

  const funders = ((funderLinks as { funder: { id: string; name: string } | null }[] | null) ?? [])
    .map((l) => l.funder)
    .filter((f): f is { id: string; name: string } => !!f);

  // Formateurs du dossier et retours déjà demandés (F-FOR-10). L'envoi partait
  // seul le lendemain d'un dossier terminé ; on peut désormais le demander
  // quand on veut.
  const { data: liensFormateur } = await sb
    .schema('app')
    .from('dossier_trainers')
    .select('trainer:trainers(id, first_name, last_name, email)')
    .eq('dossier_id', params.id);
  const formateurs = (
    (liensFormateur as { trainer: { id: string; first_name: string; last_name: string; email: string | null } | null }[] | null) ?? []
  )
    .map((l) => l.trainer)
    .filter((t): t is { id: string; first_name: string; last_name: string; email: string | null } => !!t)
    .map((t) => ({ id: t.id, nom: `${t.first_name} ${t.last_name}`.trim() || 'Formateur', email: t.email }));

  const { data: retoursFormateur } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, recipient_name, created_at, template_id')
    .eq('dossier_id', params.id)
    .eq('recipient_kind', 'trainer' as never);
  const retours = (retoursFormateur as Suivi[] | null) ?? [];

  // Entreprise cliente : on interroge une PERSONNE, pas une société. Ses
  // interlocuteurs sont les contacts de l'entreprise du dossier.
  const { data: dossierRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('company_id')
    .eq('id', params.id)
    .maybeSingle();
  const companyId = (dossierRow as { company_id: string | null } | null)?.company_id ?? null;
  const { data: contactsRows } = companyId
    ? await sb
        .schema('app')
        .from('contacts')
        .select('id, first_name, last_name, email, is_primary')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
    : { data: [] };
  const contacts = (
    (contactsRows as { id: string; first_name: string | null; last_name: string | null; email: string | null }[] | null) ?? []
  ).map((c) => ({
    id: c.id,
    nom: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Interlocuteur',
    email: c.email,
  }));

  const { data: retoursEntreprise } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, recipient_name, created_at, template_id')
    .eq('dossier_id', params.id)
    .eq('recipient_kind', 'company_rep' as never);
  const retoursClient = (retoursEntreprise as Suivi[] | null) ?? [];

  const { data: funderAssignmentsData } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('status, recipient_email, template_id')
    .eq('dossier_id', params.id)
    .eq('recipient_kind', 'funder' as never);
  const funderAssignments =
    (funderAssignmentsData as { status: string; recipient_email: string | null; template_id: string }[] | null) ?? [];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.rose.soft}`}>
            <UserRound className="w-4 h-4" />
          </span>
          <SectionLabel>Questionnaires apprenant</SectionLabel>
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.rose.soft}`}>{learnerAssignments.length}</span>
        </div>
        <AssignLearner dossierId={params.id} templates={templates} />
        {learnerAssignments.length > 0 && (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {learnerAssignments.map((q) => {
              const done = q.status === 'completed';
              return (
                <li key={q.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.rose.soft}`}>
                      <ClipboardPen className="w-4 h-4" />
                    </span>
                    <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {KIND_LABEL[q.template?.kind ?? ''] ?? q.template?.title ?? 'Questionnaire'}
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    <StatusPill tone={done ? 'success' : 'neutral'}>{done ? 'rempli' : q.status}</StatusPill>
                    {done ? (
                      <a
                        href={`/api/questionnaires/${q.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 h-8 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300 px-2.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
                      >
                        <FileText className="w-3.5 h-3.5" /> PDF
                      </a>
                    ) : (
                      <Link
                        href={`/dossiers/${params.id}/questionnaires/${q.id}/saisie`}
                        className="inline-flex items-center gap-1.5 h-8 text-[12px] font-bold text-orange-700 dark:text-orange-300 px-2.5 rounded-lg bg-orange-50 dark:bg-orange-950/50 hover:bg-orange-100 dark:hover:bg-orange-950/70 transition"
                      >
                        <ClipboardPen className="w-3.5 h-3.5" /> Saisir
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
            <Building2 className="w-4 h-4" />
          </span>
          <SectionLabel>Questionnaires entreprise</SectionLabel>
          {retoursClient.length > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.blue.soft}`}>
              {retoursClient.length}
            </span>
          )}
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Le client qui commande est une partie prenante attendue par Qualiopi : ce qu’il pense de l’organisation
          et de l’effet sur ses équipes ne se lit dans aucun autre questionnaire.
        </p>
        <SendCompany dossierId={params.id} contacts={contacts} />
        {retoursClient.length > 0 && (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {retoursClient.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[13px] text-zinc-800 dark:text-zinc-200 truncate">
                    {r.recipient_name ?? 'Interlocuteur'}
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    Envoyé le {new Date(r.created_at).toLocaleDateString('fr-FR')} ·{' '}
                    <Link href={`/questionnaires/${r.template_id}/apercu`} className="hover:underline">
                      Lire le questionnaire
                    </Link>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <StatusPill tone={r.status === 'completed' ? 'success' : 'neutral'}>
                    {r.status === 'completed' ? 'répondu' : 'en attente'}
                  </StatusPill>
                  {r.status === 'completed' ? (
                    <a
                      href={`/api/questionnaires/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Voir la réponse
                    </a>
                  ) : (
                    <Relancer assignmentId={r.id} dossierId={params.id} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.purple.soft}`}>
            <GraduationCap className="w-4 h-4" />
          </span>
          <SectionLabel>Questionnaires formateur</SectionLabel>
          {retours.length > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.purple.soft}`}>
              {retours.length}
            </span>
          )}
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Il part aussi tout seul le lendemain d’un dossier terminé — ceci sert à le demander avant, ou à le
          renvoyer.
        </p>
        <SendTrainer dossierId={params.id} formateurs={formateurs} />
        {retours.length > 0 && (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {retours.map((r) => (
              <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[13px] text-zinc-800 dark:text-zinc-200 truncate">
                    {r.recipient_name ?? 'Formateur'}
                  </span>
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    Envoyé le {new Date(r.created_at).toLocaleDateString('fr-FR')} ·{' '}
                    <Link href={`/questionnaires/${r.template_id}/apercu`} className="hover:underline">
                      Lire le questionnaire
                    </Link>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <StatusPill tone={r.status === 'completed' ? 'success' : 'neutral'}>
                    {r.status === 'completed' ? 'répondu' : 'en attente'}
                  </StatusPill>
                  {r.status === 'completed' ? (
                    <a
                      href={`/api/questionnaires/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      Voir la réponse
                    </a>
                  ) : (
                    <Relancer assignmentId={r.id} dossierId={params.id} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.emerald.soft}`}>
            <Landmark className="w-4 h-4" />
          </span>
          <SectionLabel>Questionnaires financeur</SectionLabel>
          {funderAssignments.length > 0 && (
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.emerald.soft}`}>{funderAssignments.length}</span>
          )}
        </div>
        <SendFunder dossierId={params.id} funders={funders} />
        {funderAssignments.length > 0 && (
          <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {funderAssignments.map((a, i) => (
              <li
                key={`${a.template_id}-${a.recipient_email ?? i}`}
                className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{a.recipient_email ?? 'Financeur'}</span>
                <StatusPill tone={a.status === 'completed' ? 'success' : 'neutral'}>{a.status}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
