'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import {
  RemoveCompetencySchema,
  DuplicateCompetencySchema,
} from '@/features/identity/trainer-self/ui/schemas';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { SupabaseCompetencyStorage } from '@/features/identity/trainer-self/infrastructure/supabase-competency.storage';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { RemoveCompetency } from '@/features/identity/trainer-self/application/commands/remove-competency';
import { DuplicateCompetencyToOrgs } from '@/features/identity/trainer-self/application/commands/duplicate-competency-to-orgs';
import { CompetencyId, OrganizationId } from '@/features/dossier/domain/ids';

export const removeCompetencyAction = authActionClient
  .schema(RemoveCompetencySchema)
  .action(async ({ parsedInput, ctx }) => {
    const repo = new SupabaseTrainerCompetencyRepository(ctx.supabase);
    const storage = new SupabaseCompetencyStorage(ctx.supabase);
    await new RemoveCompetency(repo, storage).execute(CompetencyId(parsedInput.competencyId));
    revalidatePath('/cv');
    return { ok: true };
  });

export const duplicateCompetencyAction = authActionClient
  .schema(DuplicateCompetencySchema)
  .action(async ({ parsedInput, ctx }) => {
    const repo = new SupabaseTrainerCompetencyRepository(ctx.supabase);
    const memberships = new SupabaseMembershipReader(ctx.supabase);
    const ids = await new DuplicateCompetencyToOrgs(repo, memberships).execute({
      sourceCompetencyId: CompetencyId(parsedInput.sourceCompetencyId),
      targetOrganizationIds: parsedInput.targetOrganizationIds.map(OrganizationId),
    });
    revalidatePath('/cv');
    return { ok: true, createdIds: ids };
  });
