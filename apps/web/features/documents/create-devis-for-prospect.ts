import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDevisHtml } from './generate-devis-html';
import { wrapGeneratedHtml } from './templates/wrap-generated-html';
import { resolveOrgVariables } from './templates/resolve-org-variables';

/**
 * Devis établi automatiquement à la validation d'une demande.
 *
 * Généré en HTML (et non en PDF) : l'aperçu et l'édition en place ne
 * fonctionnent que sur `content_html`. Le devis est donc relisable et
 * retouchable avant d'être envoyé au client — il n'est jamais envoyé tout seul.
 *
 * Rattaché au dossier issu de la conversion : il alimente ainsi l'étape
 * « Devis préparé » de la frise d'avancement.
 */
export type CreateDevisResult =
  | { ok: true; documentId: string; created: boolean }
  | { ok: false; reason: 'prospect_not_found' | 'no_formation' | 'insert_failed'; details?: string };

const VALIDITY_DAYS = 30;

export async function createDevisForProspect(
  sb: SupabaseClient,
  organizationId: string,
  args: { prospectId: string; dossierId: string | null; quantity: number },
): Promise<CreateDevisResult> {
  const { data: prospectRow } = await sb
    .schema('app')
    .from('prospects')
    .select(
      'id, first_name, last_name, email, phone, company_name, company_siret, company_address, referent_name, formation_id',
    )
    .eq('id', args.prospectId)
    .maybeSingle();

  const prospect = prospectRow as {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    company_siret: string | null;
    company_address: unknown;
    referent_name: string | null;
    formation_id: string | null;
  } | null;
  if (!prospect) return { ok: false, reason: 'prospect_not_found' };
  if (!prospect.formation_id) return { ok: false, reason: 'no_formation' };

  // Un devis par dossier : on ne rejoue pas la génération à chaque validation.
  if (args.dossierId) {
    const { data: existing } = await sb
      .schema('app')
      .from('documents')
      .select('id')
      .eq('dossier_id', args.dossierId)
      .eq('kind', 'devis')
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) return { ok: true, documentId: (existing as { id: string }).id, created: false };
  }

  const [{ data: formationRow }, { data: orgRow }, variables] = await Promise.all([
    sb
      .schema('app')
      .from('formations')
      .select('title, default_price_cents, default_duration_hours, default_modality')
      .eq('id', prospect.formation_id)
      .maybeSingle(),
    sb
      .schema('app')
      .from('organizations')
      .select(
        'name, legal_name, siret, declaration_activite, address, contact_email, contact_phone, vat_regime, default_vat_rate',
      )
      .eq('id', organizationId)
      .maybeSingle(),
    resolveOrgVariables(sb, organizationId),
  ]);

  const formation = (formationRow ?? {}) as {
    title?: string;
    default_price_cents?: number | null;
    default_duration_hours?: number | null;
    default_modality?: string | null;
  };
  const org = (orgRow ?? {}) as {
    name?: string;
    legal_name?: string | null;
    siret?: string | null;
    declaration_activite?: string | null;
    address?: unknown;
    contact_email?: string | null;
    contact_phone?: string | null;
    vat_regime?: string | null;
    default_vat_rate?: number | null;
  };

  // Le régime de TVA de l'organisme décide : exonéré → 0 %, mention légale gérée
  // par le gabarit.
  const vatRate = org.vat_regime === 'subject' ? Number(org.default_vat_rate ?? 0) : 0;

  const issuedOn = new Date();
  const reference = `DEV-${issuedOn.getFullYear()}-${String(issuedOn.getMonth() + 1).padStart(2, '0')}${String(
    issuedOn.getDate(),
  ).padStart(2, '0')}-${args.prospectId.slice(0, 4).toUpperCase()}`;

  const body = buildDevisHtml({
    reference,
    issuedOn,
    validityDays: VALIDITY_DAYS,
    org: {
      name: org.name ?? '',
      legalName: org.legal_name ?? null,
      siret: org.siret ?? null,
      nda: org.declaration_activite ?? null,
      address: variables['organisme_adresse'] ?? null,
      contactEmail: org.contact_email ?? null,
      contactPhone: org.contact_phone ?? null,
    },
    client: {
      fullName: `${prospect.first_name} ${prospect.last_name}`.trim(),
      email: prospect.email,
      phone: prospect.phone,
      companyName: prospect.company_name,
      companySiret: prospect.company_siret,
      companyAddress: composeAddress(prospect.company_address),
      referentName: prospect.referent_name,
    },
    formation: {
      title: formation.title ?? 'Formation',
      durationHours: formation.default_duration_hours ?? null,
      modality: formation.default_modality ?? null,
    },
    quantity: Math.max(1, args.quantity),
    unitPriceHtCents: formation.default_price_cents ?? 0,
    vatRate,
  });

  const { data: inserted, error } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: organizationId,
      dossier_id: args.dossierId,
      kind: 'devis',
      title: `Devis ${reference}`,
      status: 'ready',
      content_html: wrapGeneratedHtml(body, variables),
      generated_at: issuedOn.toISOString(),
      generation_input: {
        auto: true,
        source: 'prospect_validation',
        prospect_id: args.prospectId,
        quantity: args.quantity,
        vat_rate: vatRate,
      },
      metadata: { prospect_id: args.prospectId },
    } as never)
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, reason: 'insert_failed', details: error?.message };
  }
  return { ok: true, documentId: (inserted as { id: string }).id, created: true };
}

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

function composeAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return typeof raw === 'string' ? raw : null;
  const a = raw as AddressJson;
  const parts = [
    [a.line1, a.line2].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}
