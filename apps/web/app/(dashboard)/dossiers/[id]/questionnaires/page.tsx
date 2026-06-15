// ARCHETYPE: command
// Justification: questionnaires du dossier — affectation apprenant, saisie manuelle, export PDF, financeur.

import Link from 'next/link';
import { ClipboardPen, FileText } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { SendFunder } from './send-funder';
import { AssignLearner } from './assign-learner';

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

  const { data: funderAssignmentsData } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('status, recipient_email, template_id')
    .eq('dossier_id', params.id)
    .eq('recipient_kind', 'funder' as never);
  const funderAssignments =
    (funderAssignmentsData as { status: string; recipient_email: string | null; template_id: string }[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionLabel>Questionnaires apprenant ({learnerAssignments.length})</SectionLabel>
        <AssignLearner dossierId={params.id} templates={templates} />
        {learnerAssignments.length > 0 && (
          <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {learnerAssignments.map((q) => {
              const done = q.status === 'completed';
              return (
                <li key={q.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-3">
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {KIND_LABEL[q.template?.kind ?? ''] ?? q.template?.title ?? 'Questionnaire'}
                  </span>
                  <div className="flex items-center gap-2">
                    {done ? (
                      <a
                        href={`/api/questionnaires/${q.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-600 dark:text-zinc-300 px-2 py-1 rounded-md border border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                      >
                        <FileText className="w-3 h-3" /> PDF
                      </a>
                    ) : (
                      <Link
                        href={`/dossiers/${params.id}/questionnaires/${q.id}/saisie`}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-orange-600 dark:text-orange-400 px-2 py-1 rounded-md bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-950/60 transition"
                      >
                        <ClipboardPen className="w-3 h-3" /> Saisir
                      </Link>
                    )}
                    <StatusPill tone={done ? 'success' : 'neutral'}>{done ? 'rempli' : q.status}</StatusPill>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 pt-2">
        <SectionLabel>Questionnaires financeur</SectionLabel>
        <SendFunder dossierId={params.id} funders={funders} />
        {funderAssignments.length > 0 && (
          <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {funderAssignments.map((a, i) => (
              <li
                key={`${a.template_id}-${a.recipient_email ?? i}`}
                className="py-3 px-1 text-[13px] flex items-center justify-between gap-3"
              >
                <span className="text-zinc-700 dark:text-zinc-300">{a.recipient_email ?? 'Financeur'}</span>
                <StatusPill tone={a.status === 'completed' ? 'success' : 'neutral'}>{a.status}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
