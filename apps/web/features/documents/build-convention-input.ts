import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type ConventionInput } from './generate-convention-pdf';
import { loadOrgBranding } from './load-org-branding';
import type { DossierPayer } from './dossier-payers';

type AddressJson = {
  line1?: string;
  line2?: string;
  city?: string;
  postal_code?: string;
  country?: string;
};

const composeAddress = (addr: AddressJson | null | undefined): string | null => {
  if (!addr || typeof addr !== 'object') return null;
  const parts = [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
};

/**
 * Charge un dossier et construit l'entrée de génération de convention.
 * `payer` renseigne le bloc financement (un financeur ou le reste à charge) ;
 * `null` produit une convention générique (sans financeur). Renvoie null si le dossier est introuvable.
 */
export async function buildConventionInput(
  sb: SupabaseClient,
  dossierId: string,
  payer: DossierPayer | null,
): Promise<{ input: ConventionInput; organizationId: string } | null> {
  const { data: dossierData } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      reference, start_date, end_date, total_hours, modality, modalities, total_amount_cents, currency, accessibility_notes,
      organization_id, learner_id, company_id,
      learner:learners(first_name, last_name, email, birth_date, address),
      company:companies(name, siret, address, contact_name),
      formation:formations(title, description, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method)
    `)
    .eq('id', dossierId)
    .maybeSingle();

  if (!dossierData) return null;

  const d = dossierData as unknown as {
    reference: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    modalities: string[] | null;
    total_amount_cents: number | null;
    currency: string;
    accessibility_notes: string | null;
    organization_id: string;
    learner_id: string | null;
    company_id: string | null;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null; address: AddressJson | null } | null;
    company: { name: string; siret: string | null; address: AddressJson | null; contact_name: string | null } | null;
    formation: { title: string; description: string | null; objectives: string[] | null; prerequisites: string[] | null; target_audience: string | null; evaluation_method: string | null; pedagogical_method: string | null } | null;
  };

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .eq('id', d.organization_id)
    .maybeSingle();
  const org = (orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
  } | null) ?? null;

  const orgId = d.organization_id;
  const branding = await loadOrgBranding(sb as never, orgId);

  const input: ConventionInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      contactEmail: org?.contact_email ?? null,
      contactPhone: (org as { contact_phone?: string | null } | null)?.contact_phone ?? null,
      certifications: (org as { certifications?: string | null } | null)?.certifications ?? null,
      // Jamais l'e-mail en repli : une convention signée « contact@… » n'est
      // pas signée. Sans représentant renseigné, la ligne est simplement absente
      // (Paramètres → Organisation).
      representativeName: branding.representativeName ?? null,
    },
    signaturePng: branding.signaturePng,
    stampPng: branding.stampPng,
    logoPng: branding.logoPng,
    representativeTitle: branding.representativeTitle,
    place: org?.address?.city ?? null,
    learner: {
      firstName: d.learner?.first_name ?? '—',
      lastName: d.learner?.last_name ?? '—',
      email: d.learner?.email ?? '—',
      birthDate: d.learner?.birth_date ?? null,
      address: composeAddress(d.learner?.address),
    },
    company: d.company
      ? {
          name: d.company.name,
          siret: d.company.siret,
          address: composeAddress(d.company.address),
          representative: d.company.contact_name,
        }
      : null,
    funder: payer
      ? {
          name: payer.funderName,
          modeLabel: payer.modeLabel,
          amountCents: payer.amountCents,
          externalFileNumber: payer.externalFileNumber,
        }
      : null,
    formation: {
      title: d.formation?.title ?? '—',
      description: d.formation?.description ?? null,
      objectives: d.formation?.objectives ?? [],
      targetAudience: d.formation?.target_audience ?? null,
      prerequisites: d.formation?.prerequisites ?? [],
      evaluationMethod: d.formation?.evaluation_method ?? null,
      pedagogicalMethod: d.formation?.pedagogical_method ?? null,
    },
    dossier: {
      reference: d.reference,
      startDate: d.start_date,
      endDate: d.end_date,
      totalHours: d.total_hours,
      modality: d.modality,
      modalities: d.modalities ?? undefined,
      totalAmountCents: d.total_amount_cents,
      currency: d.currency,
      accessibilityNotes: d.accessibility_notes,
    },
    // Particulier qui paie lui-même (pas d'entreprise, pas de financeur) :
    // contrat de formation professionnelle, avec délai de rétractation.
    contractKind: !d.company && (!payer || payer.payer === 'reste') ? 'contrat' : 'convention',
    generatedAt: new Date(),
  };

  return { input, organizationId: orgId };
}
