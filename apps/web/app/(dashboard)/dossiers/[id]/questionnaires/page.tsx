// ARCHETYPE: command
// Justification: liste réelle des questionnaires assignés au dossier.

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { SendFunder } from './send-funder';

const KIND_LABEL: Record<string, string> = {
  positionnement: 'Positionnement',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Satisfaction à froid',
  opco: 'OPCO',
  evaluation_acquis: 'Évaluation des acquis',
  custom: 'Personnalisé',
};

export default async function QuestionnairesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, recipient_kind, template:questionnaire_templates(kind, title)')
    .eq('dossier_id', params.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data as any[]) ?? [];

  const { data: funderLinks } = await sb
    .schema('app')
    .from('dossier_funders')
    .select('funder:funders(id, name)')
    .eq('dossier_id', params.id);
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
    (funderAssignmentsData as
      | { status: string; recipient_email: string | null; template_id: string }[]
      | null) ?? [];

  return (
    <div className="space-y-4">
      <SectionLabel>Questionnaires ({rows.length})</SectionLabel>
      {rows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Aucun questionnaire assigné.</p>
      ) : (
        <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
          {rows.map((q) => (
            <li key={q.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-3">
              <span>{KIND_LABEL[q.template?.kind] ?? q.template?.title ?? q.template?.kind ?? 'Questionnaire'}</span>
              <StatusPill tone={q.status === 'completed' ? 'success' : 'neutral'}>{q.status}</StatusPill>
            </li>
          ))}
        </ul>
      )}

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
                <span className="text-zinc-700 dark:text-zinc-300">
                  {a.recipient_email ?? 'Financeur'}
                </span>
                <StatusPill tone={a.status === 'completed' ? 'success' : 'neutral'}>
                  {a.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
