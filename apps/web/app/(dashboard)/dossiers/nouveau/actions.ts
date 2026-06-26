'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateDossierReference } from '@/features/crm/prospect-conversion/dossier-reference';
import { CreateDossierSchema } from './schema';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

// Réplique de resolveAdminOrgId (cf. prospects/actions.ts, formateurs/nouveau/actions.ts) :
// membership par défaut de l'utilisateur, restreinte aux rôles administrateurs.
async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as never as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            is: (k: string, v: null) => {
              order: (
                k: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: { organization_id: string; role: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id;
}

export const createDossierAction = authActionClient
  .schema(CreateDossierSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    const dossierId = randomUUID();
    const year = Number(new Date().getFullYear());
    const reference = generateDossierReference(dossierId, year);

    // total_hours NOT NULL : somme des modules, minimum 1 pour un brouillon.
    const totalHours =
      parsedInput.modules.reduce((acc, m) => acc + m.durationHours, 0) || 1;

    const modules = parsedInput.modules.map((m, i) => ({
      id: randomUUID(),
      module_id: m.moduleId,
      position: i,
      title_snapshot: m.title,
      duration_hours: m.durationHours,
    }));

    const trainers = parsedInput.trainerId
      ? [{ trainer_id: parsedInput.trainerId, is_lead: true }]
      : [];

    const funders = parsedInput.funders.map((f) => ({
      id: randomUUID(),
      funder_id: f.funderId,
      amount_cents: f.amountCents,
      external_file_number: f.externalFileNumber,
      status: 'pending',
    }));

    const metadata: Record<string, unknown> = {};

    const { error } = await sb.rpc('save_dossier' as never, {
      p_dossier: {
        id: dossierId,
        organization_id: orgId,
        reference,
        learner_id: parsedInput.learnerId,
        company_id: parsedInput.companyId,
        formation_id: parsedInput.formationId,
        status: 'draft',
        modality: parsedInput.modality,
        start_date: parsedInput.startDate,
        end_date: parsedInput.endDate,
        total_hours: totalHours,
        total_amount_cents: parsedInput.totalAmountCents,
        currency: 'EUR',
        metadata,
        modules,
        trainers,
        funders,
      },
      p_events: [],
    } as never);

    if (error) {
      return {
        ok: false as const,
        error: 'dossier_create_failed',
        details: (error as { message?: string }).message,
      };
    }

    // La RPC save_dossier n'upsert pas external_file_number : on le pose après coup
    // sur les lignes qu'on vient d'insérer (ids générés ci-dessus).
    const withFileNumber = funders.filter((f) => f.external_file_number);
    if (withFileNumber.length > 0) {
      await Promise.all(
        withFileNumber.map((f) =>
          sb
            .schema('app')
            .from('dossier_funders')
            .update({ external_file_number: f.external_file_number })
            .eq('id', f.id),
        ),
      );
    }

    revalidatePath('/dossiers');
    return { ok: true as const, dossierId, reference };
  });
