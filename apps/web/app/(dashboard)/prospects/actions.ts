'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { ConvertProspectSchema } from './convert-schema';
import {
  matchLearner,
  matchCompany,
  detectPotentialDuplicates,
} from '@/features/crm/prospect-conversion/matching';
import { generateDossierReference } from '@/features/crm/prospect-conversion/dossier-reference';
import type {
  ProspectForConversion,
  LearnerCandidate,
  CompanyCandidate,
  ConversionReport,
} from '@/features/crm/prospect-conversion/types';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

// Réplique fidèle de resolveAdminOrgId (cf. formateurs/nouveau/actions.ts) :
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

export const convertProspect = authActionClient
  .schema(ConvertProspectSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    // 1. Charger le prospect (RLS)
    const { data: pRow, error: pErr } = await sb
      .schema('app')
      .from('prospects' as never)
      .select(
        'id, organization_id, civility, first_name, last_name, email, phone, birth_date, rqth, formation_id, preferred_modality, preferred_start_date, company_name, funder_kind, converted_dossier_id',
      )
      .eq('id', parsedInput.prospectId)
      .maybeSingle();
    if (pErr || !pRow) return { ok: false as const, error: 'prospect_not_found' };
    const p = pRow as never as {
      id: string;
      organization_id: string | null;
      first_name: string;
      last_name: string;
      email: string;
      phone: string | null;
      birth_date: string | null;
      rqth: boolean;
      formation_id: string | null;
      preferred_modality: string | null;
      preferred_start_date: string | null;
      company_name: string | null;
      funder_kind: string;
      converted_dossier_id: string | null;
    };

    // 2. Idempotence
    if (p.converted_dossier_id) {
      return {
        ok: true as const,
        dossierId: p.converted_dossier_id,
        report: {
          learner: 'reused',
          company: 'none',
          signals: [],
          alreadyConverted: true,
        } satisfies ConversionReport,
      };
    }
    if (!p.formation_id) return { ok: false as const, error: 'prospect_without_formation' };

    const prospect: ProspectForConversion = {
      id: p.id,
      organizationId: p.organization_id,
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.phone,
      birthDate: p.birth_date,
      rqth: p.rqth,
      formationId: p.formation_id,
      preferredModality: p.preferred_modality,
      preferredStartDate: p.preferred_start_date,
      companyName: p.company_name,
      funderKind: p.funder_kind,
      convertedDossierId: null,
    };

    // 3. Apprenant : match / create
    const { data: learnersData } = await sb
      .schema('app')
      .from('learners')
      .select('id, email, last_name')
      .eq('organization_id', orgId);
    const learners = (
      (learnersData ?? []) as never as Array<{
        id: string;
        email: string;
        last_name: string;
      }>
    ).map<LearnerCandidate>((l) => ({ id: l.id, email: l.email, lastName: l.last_name }));
    const lm = matchLearner(prospect.email, learners);
    let learnerId: string;
    let learnerOutcome: 'reused' | 'created';
    if (lm.action === 'reuse') {
      learnerId = lm.id;
      learnerOutcome = 'reused';
    } else {
      const { data: ins, error } = await sb
        .schema('app')
        .from('learners')
        .insert({
          organization_id: orgId,
          first_name: prospect.firstName,
          last_name: prospect.lastName,
          email: prospect.email,
          phone: prospect.phone,
          birth_date: prospect.birthDate,
          rqth: prospect.rqth,
        } as never)
        .select('id')
        .single();
      if (error || !ins) return { ok: false as const, error: 'learner_create_failed' };
      learnerId = (ins as { id: string }).id;
      learnerOutcome = 'created';
    }

    // 4. Entreprise : match / create (seulement si company_name)
    const { data: companiesData } = await sb
      .schema('app')
      .from('companies')
      .select('id, name, siret')
      .eq('organization_id', orgId);
    const companies = (
      (companiesData ?? []) as never as Array<{
        id: string;
        name: string;
        siret: string | null;
      }>
    ).map<CompanyCandidate>((c) => ({ id: c.id, name: c.name, siret: c.siret }));
    let companyId: string | null = null;
    let companyOutcome: 'reused' | 'created' | 'none' = 'none';
    if (prospect.companyName) {
      const cm = matchCompany(null, prospect.companyName, companies);
      if (cm.action === 'reuse') {
        companyId = cm.id;
        companyOutcome = 'reused';
      } else {
        const { data: ins, error } = await sb
          .schema('app')
          .from('companies')
          .insert({
            organization_id: orgId,
            name: prospect.companyName,
          } as never)
          .select('id')
          .single();
        if (error || !ins) return { ok: false as const, error: 'company_create_failed' };
        companyId = (ins as { id: string }).id;
        companyOutcome = 'created';
      }
    }

    // 5. Signalements doublons
    const signals = detectPotentialDuplicates(prospect, learners, companies);

    // 6. Dossier via save_dossier
    // id explicite : la RPC insère p_dossier->>'id' (colonne PK NOT NULL) et le renvoie
    // dans {id, events_count} ; sans id fourni, l'insert échouerait sur NULL.
    const dossierId = randomUUID();
    const year = Number(new Date().getFullYear());
    const reference = generateDossierReference(prospect.id, year);
    // start/end/total_hours sont NOT NULL côté table : valeurs minimales pour un brouillon.
    const startDate = prospect.preferredStartDate ?? new Date().toISOString().slice(0, 10);
    const { error: dErr } = await sb.rpc('save_dossier' as never, {
      p_dossier: {
        id: dossierId,
        organization_id: orgId,
        reference,
        learner_id: learnerId,
        company_id: companyId,
        formation_id: prospect.formationId,
        status: 'draft',
        modality: prospect.preferredModality ?? 'distanciel',
        start_date: startDate,
        end_date: startDate,
        total_hours: 1,
        metadata: { from_prospect: prospect.id, funder_kind: prospect.funderKind },
      },
      p_events: [],
    } as never);
    if (dErr) {
      return {
        ok: false as const,
        error: 'dossier_create_failed',
        details: (dErr as { message?: string }).message,
      };
    }

    // 7. Marquer le prospect converti + revendiquer l'org
    await sb
      .schema('app')
      .from('prospects' as never)
      .update({
        converted_dossier_id: dossierId,
        status: 'converted',
        organization_id: orgId,
      } as never)
      .eq('id', prospect.id);

    revalidatePath('/prospects');
    const report: ConversionReport = {
      learner: learnerOutcome,
      company: companyOutcome,
      signals,
    };
    return { ok: true as const, dossierId, report };
  });
