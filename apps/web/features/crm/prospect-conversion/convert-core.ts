import 'server-only';
import { randomUUID } from 'node:crypto';
import { matchLearner, matchCompany, detectPotentialDuplicates } from './matching';
import { generateDossierReference } from './dossier-reference';
import type {
  ProspectForConversion,
  LearnerCandidate,
  CompanyCandidate,
  ConversionReport,
} from './types';

// Client Supabase (RLS scoped OU service_role) : le cœur scope explicitement par orgId.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

export type ConvertResult =
  | { ok: true; dossierId: string; report: ConversionReport }
  | { ok: false; error: string; details?: string };

/**
 * Cœur de conversion prospect → dossier (apprenant + entreprise match/create +
 * dossier via save_dossier). Idempotent. Partagé entre l'action manuelle
 * (convertProspect) et la validation auto (validateProspectDemande).
 */
export async function convertProspectToDossier(
  sb: Sb,
  orgId: string,
  prospectId: string,
): Promise<ConvertResult> {
  const { data: pRow, error: pErr } = await sb
    .schema('app')
    .from('prospects')
    .select(
      'id, organization_id, civility, first_name, last_name, email, phone, birth_date, rqth, formation_id, preferred_modality, preferred_start_date, company_name, funder_kind, converted_dossier_id',
    )
    .eq('id', prospectId)
    .maybeSingle();
  if (pErr || !pRow) return { ok: false, error: 'prospect_not_found' };
  const p = pRow as {
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

  if (p.converted_dossier_id) {
    return {
      ok: true,
      dossierId: p.converted_dossier_id,
      report: { learner: 'reused', company: 'none', signals: [], alreadyConverted: true },
    };
  }
  if (!p.formation_id) return { ok: false, error: 'prospect_without_formation' };

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

  // Apprenant : match / create
  const { data: learnersData } = await sb
    .schema('app')
    .from('learners')
    .select('id, email, last_name')
    .eq('organization_id', orgId);
  const learners = ((learnersData ?? []) as Array<{ id: string; email: string; last_name: string }>).map<LearnerCandidate>(
    (l) => ({ id: l.id, email: l.email, lastName: l.last_name }),
  );
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
      })
      .select('id')
      .single();
    if (error || !ins) return { ok: false, error: 'learner_create_failed' };
    learnerId = (ins as { id: string }).id;
    learnerOutcome = 'created';
  }

  // Entreprise : match / create (si company_name)
  const { data: companiesData } = await sb
    .schema('app')
    .from('companies')
    .select('id, name, siret')
    .eq('organization_id', orgId);
  const companies = ((companiesData ?? []) as Array<{ id: string; name: string; siret: string | null }>).map<CompanyCandidate>(
    (c) => ({ id: c.id, name: c.name, siret: c.siret }),
  );
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
        .insert({ organization_id: orgId, name: prospect.companyName })
        .select('id')
        .single();
      if (error || !ins) return { ok: false, error: 'company_create_failed' };
      companyId = (ins as { id: string }).id;
      companyOutcome = 'created';
    }
  }

  const signals = detectPotentialDuplicates(prospect, learners, companies);

  const dossierId = randomUUID();
  const year = Number(new Date().getFullYear());
  const reference = generateDossierReference(prospect.id, year);
  const startDate = prospect.preferredStartDate ?? new Date().toISOString().slice(0, 10);
  const { error: dErr } = await sb.rpc('save_dossier', {
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
  });
  if (dErr) {
    return { ok: false, error: 'dossier_create_failed', details: (dErr as { message?: string }).message };
  }

  await sb
    .schema('app')
    .from('prospects')
    .update({ converted_dossier_id: dossierId, status: 'converted', organization_id: orgId })
    .eq('id', prospect.id);

  return { ok: true, dossierId, report: { learner: learnerOutcome, company: companyOutcome, signals } };
}
