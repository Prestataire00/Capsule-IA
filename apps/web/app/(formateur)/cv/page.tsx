// ARCHETYPE: command
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { ListMyCompetenciesQuery } from '@/features/identity/trainer-self/application/queries/list-my-competencies';
import { CompetencyList } from '@/features/identity/trainer-self/ui/competency-list';
import { CompetencyUploadDialog } from '@/features/identity/trainer-self/ui/competency-upload-dialog';
import { FileText } from 'lucide-react';

export default async function CvPage() {
  const supabase = supabaseServer();
  const memberships = await new SupabaseMembershipReader(supabase).list();
  if (memberships.length === 0) return null;

  const focus = cookies().get('of_focus')?.value ?? 'all';
  const active =
    focus === 'all'
      ? memberships[0]!
      : memberships.find((m) => m.organizationId === focus) ?? memberships[0]!;

  const repo = new SupabaseTrainerCompetencyRepository(supabase);
  const competencies = await new ListMyCompetenciesQuery(repo).execute(active.trainerId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-950/50 dark:to-blue-950/30 text-purple-700 dark:text-purple-300 flex items-center justify-center shadow-sm">
            <FileText className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Mes compétences</h1>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Chez <strong>{active.organizationName}</strong>
              {memberships.length > 1 && ' · changer d’OF dans le header'}
            </p>
          </div>
        </div>
        <CompetencyUploadDialog
          trainerId={active.trainerId as string}
          organizationId={active.organizationId as string}
        />
      </header>

      <CompetencyList
        competencies={competencies}
        memberships={memberships}
        activeTrainerId={active.trainerId as string}
      />
    </div>
  );
}
