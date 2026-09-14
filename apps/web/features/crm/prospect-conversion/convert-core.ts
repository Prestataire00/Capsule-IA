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
      'id, organization_id, civility, first_name, last_name, email, phone, birth_date, rqth, formation_id, preferred_modality, preferred_start_date, company_name, company_siret, company_address, referent_name, referent_email, referent_phone, situation, funder_kind, converted_dossier_id, custom_formation_title, custom_formation_hours, custom_formation_price_cents',
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
    company_siret: string | null;
    company_address: unknown;
    referent_name: string | null;
    referent_email: string | null;
    referent_phone: string | null;
    situation: string | null;
    funder_kind: string;
    converted_dossier_id: string | null;
    custom_formation_title: string | null;
    custom_formation_hours: number | string | null;
    custom_formation_price_cents: number | string | null;
  };

  if (p.converted_dossier_id) {
    return {
      ok: true,
      dossierId: p.converted_dossier_id,
      report: { learner: 'reused', company: 'none', signals: [], alreadyConverted: true },
    };
  }
  // Une demande peut porter sur un besoin spécifique : la formation n'existe
  // pas encore au catalogue, seul son intitulé est connu. Elle est créée à la
  // conversion (un dossier exige une formation).
  if (!p.formation_id && !p.custom_formation_title) {
    return { ok: false, error: 'prospect_without_formation' };
  }

  const prospect: ProspectForConversion = {
    id: p.id,
    organizationId: p.organization_id,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    phone: p.phone,
    birthDate: p.birth_date,
    rqth: p.rqth,
    formationId: p.formation_id ?? '',
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
        statut: p.situation === 'salarie' ? 'salarie' : p.situation === 'independant' ? 'independant' : null,
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
  // Entreprise cliente = celle qui commande et paie (comme RFC). Un particulier
  // ou un demandeur d'emploi s'inscrit à titre individuel, même s'il cite un
  // employeur : ses documents (devis, contrat, facture) sont à son nom.
  const individual = p.situation === 'particulier' || p.situation === 'demandeur';
  const siret = (p.company_siret ?? '').replace(/\s+/g, '');
  const validSiret = /^\d{14}$/.test(siret) ? siret : null;
  const referent = {
    contact_name: p.referent_name?.trim() || null,
    contact_email: p.referent_email?.trim() || null,
    contact_phone: p.referent_phone?.trim() || null,
  };
  let companyId: string | null = null;
  let companyOutcome: 'reused' | 'created' | 'none' = 'none';
  if (prospect.companyName && !individual) {
    const cm = matchCompany(validSiret, prospect.companyName, companies);
    if (cm.action === 'reuse') {
      companyId = cm.id;
      companyOutcome = 'reused';
      // Complète la fiche (SIRET, adresse, responsable) sans écraser une saisie manuelle.
      const { data: existingRow } = await sb
        .schema('app')
        .from('companies')
        .select('siret, address, contact_name, contact_email, contact_phone')
        .eq('id', cm.id)
        .maybeSingle();
      const existing = (existingRow ?? {}) as {
        siret?: string | null;
        address?: unknown;
        contact_name?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
      };
      const patch: Record<string, unknown> = {};
      if (!existing.siret && validSiret) patch.siret = validSiret;
      if (isEmptyAddress(existing.address) && !isEmptyAddress(p.company_address)) patch.address = p.company_address;
      if (!existing.contact_name && referent.contact_name) patch.contact_name = referent.contact_name;
      if (!existing.contact_email && referent.contact_email) patch.contact_email = referent.contact_email;
      if (!existing.contact_phone && referent.contact_phone) patch.contact_phone = referent.contact_phone;
      if (Object.keys(patch).length > 0) {
        const { error } = await sb.schema('app').from('companies').update(patch).eq('id', cm.id);
        if (error) console.error('[conversion] fiche entreprise non complétée', cm.id, error.message);
      }
    } else {
      const { data: ins, error } = await sb
        .schema('app')
        .from('companies')
        .insert({
          organization_id: orgId,
          name: prospect.companyName,
          siret: validSiret,
          address: isEmptyAddress(p.company_address) ? {} : p.company_address,
          ...referent,
        })
        .select('id')
        .single();
      if (error || !ins) return { ok: false, error: 'company_create_failed' };
      companyId = (ins as { id: string }).id;
      companyOutcome = 'created';
    }

    // Le salarié est rattaché à son entreprise (fiche entreprise, récap des
    // convocations, catégorie BPF) — sans écraser un rattachement existant.
    await sb.schema('app').from('learners').update({ company_id: companyId }).eq('id', learnerId).is('company_id', null);
  }

  const signals = detectPotentialDuplicates(prospect, learners, companies);

  // Formation : celle du catalogue, ou celle créée pour ce besoin précis.
  const hours = Math.max(1, Number(p.custom_formation_hours ?? 0) || 7);
  const formationId =
    p.formation_id ??
    (await createBespokeFormation(sb, orgId, {
      title: p.custom_formation_title as string,
      hours,
      priceCents: Math.max(0, Number(p.custom_formation_price_cents ?? 0) || 0),
      modality: p.preferred_modality ?? 'presentiel',
    }));
  if (!formationId) return { ok: false, error: 'formation_create_failed' };

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
      formation_id: formationId,
      status: 'draft',
      modality: prospect.preferredModality ?? 'distanciel',
      start_date: startDate,
      end_date: startDate,
      total_hours: p.formation_id ? 1 : hours,
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

/**
 * Formation montée pour un besoin spécifique : hors catalogue public, avec la
 * durée et le tarif indiqués sur la demande (base du devis, modifiables
 * ensuite sur la fiche formation).
 */
async function createBespokeFormation(
  sb: Sb,
  orgId: string,
  f: { title: string; hours: number; priceCents: number; modality: string },
): Promise<string | null> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const slug = `${f.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'formation'}-${suffix.toLowerCase()}`;

  const { data, error } = await sb
    .schema('app')
    .from('formations')
    .insert({
      organization_id: orgId,
      code: `SM-${suffix}`,
      title: f.title,
      slug,
      summary: 'Formation montée pour un besoin spécifique (hors catalogue).',
      default_modality: f.modality,
      default_duration_hours: f.hours,
      default_price_cents: f.priceCents,
      is_published: false,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[conversion] formation sur mesure non créée', error?.message);
    return null;
  }
  return (data as { id: string }).id;
}

function isEmptyAddress(raw: unknown): boolean {
  if (!raw) return true;
  if (typeof raw === 'string') return raw.trim().length === 0;
  return typeof raw === 'object' && Object.values(raw as Record<string, unknown>).every((v) => !v);
}
