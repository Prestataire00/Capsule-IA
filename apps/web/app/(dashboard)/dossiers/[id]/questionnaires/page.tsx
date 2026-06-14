// ARCHETYPE: command
// Justification: liste réelle des questionnaires assignés au dossier.

import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

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
    </div>
  );
}
