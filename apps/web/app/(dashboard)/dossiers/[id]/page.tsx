// ARCHETYPE: command
// Justification: vue d'ensemble réelle du dossier — compteurs + accès rapides aux onglets.

import { Calendar, FileText, Users as UsersIcon } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { KpiCard, type Accent } from '@/shared/ui/kpi-card';
import { loadDossierProgress } from '@/features/dossier/load-progress';
import { DossierProgressTracker } from '@/features/dossier/progress-tracker';
import { TagsEditor } from './tags-editor';
import { BpfFieldsEditor } from './bpf-fields-editor';

export default async function DossierOverviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer() as unknown as SupabaseClient;
  const id = params.id;
  const count = async (table: string, col = 'dossier_id') => {
    const { count } = await sb.schema('app').from(table).select('*', { count: 'exact', head: true }).eq(col, id);
    return count ?? 0;
  };
  const [sessions, documents, funders, dossier, progress] = await Promise.all([
    count('session_dossiers'),
    count('documents'),
    count('dossier_funders'),
    sb.schema('app').from('dossiers').select('tags, action_type, trainee_category').eq('id', id).maybeSingle(),
    loadDossierProgress(sb, id),
  ]);
  const tags = ((dossier.data?.tags as string[] | null) ?? []);
  const actionType = (dossier.data?.action_type as string | null) ?? null;
  const traineeCategory = (dossier.data?.trainee_category as string | null) ?? null;

  const cards: { icon: typeof Calendar; label: string; value: number; href: string; accent: Accent }[] = [
    { icon: Calendar, label: 'Sessions', value: sessions, href: 'sessions', accent: 'blue' },
    { icon: FileText, label: 'Documents', value: documents, href: 'documents', accent: 'orange' },
    { icon: UsersIcon, label: 'Financeurs', value: funders, href: 'financeurs', accent: 'emerald' },
  ];

  return (
    <div className="space-y-6">
      <SectionLabel>Vue d'ensemble</SectionLabel>
      <DossierProgressTracker progress={progress} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ icon, label, value, href, accent }) => (
          <KpiCard key={href} icon={icon} label={label} value={value} accent={accent} href={`/dossiers/${id}/${href}`} />
        ))}
      </div>
      <BpfFieldsEditor dossierId={id} initialActionType={actionType} initialTraineeCategory={traineeCategory} />
      <TagsEditor dossierId={id} initialTags={tags} />

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Utilisez les onglets ci-dessus pour gérer sessions, émargements, heures, Qualiopi, financeurs et documents.
      </p>
    </div>
  );
}
