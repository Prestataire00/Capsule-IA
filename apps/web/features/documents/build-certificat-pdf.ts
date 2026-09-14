import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateCertificatPDF, type CertificatInput } from './generate-certificat-pdf';
import { loadOrgBranding } from './load-org-branding';
import { persistGeneratedDocument } from './persist-document';
import { computeDossierAttendanceRate } from '@/features/attendance/attendance-rate';

// Certificat de réalisation d'un dossier (arrêté du 21/12/2020), partagé par
// le téléchargement et l'envoi à l'entreprise cliente en fin de formation.
// Client service_role : l'appelant a vérifié l'accès au dossier.

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

function composeAddress(addr: AddressJson | null | undefined): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const parts = [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

export type BuiltCertificat = {
  bytes: Uint8Array;
  reference: string;
  organizationId: string;
  learnerName: string;
  formationTitle: string;
};

export async function buildCertificatPdf(
  sb: SupabaseClient,
  dossierId: string,
  opts: { persist?: boolean } = {},
): Promise<BuiltCertificat | null> {
  const { data: dossierData } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      reference, start_date, end_date, total_hours, modality,
      organization_id, learner_id,
      learner:learners(first_name, last_name, email, birth_date),
      formation:formations(title)
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
    organization_id: string;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null } | null;
    formation: { title: string } | null;
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

  // Heures réalisées = heures SUIVIES par l'apprenant (retards, départs anticipés
  // et absences déduits), recalculées à la demande (0146, 0147). Le certificat
  // reprenait les heures dispensées : un absent y figurait pour la durée complète.
  await sb.schema('app').rpc('recompute_dossier_hours' as never, { p_dossier_id: dossierId } as never);
  const { data: hoursRow } = await sb
    .schema('app')
    .from('dossier_hours_tracking')
    .select('hours_planned, hours_delivered, hours_attended, attendance_rate')
    .eq('dossier_id', dossierId)
    .maybeSingle();
  const hours = hoursRow as { hours_planned: number; hours_delivered: number; hours_attended: number; attendance_rate: number } | null;

  const plannedHours = hours?.hours_planned ?? d.total_hours;
  // Sans aucune séance dispensée (organisme qui n'émarge pas dans Capsule), la durée prévue.
  const deliveredHours = hours && Number(hours.hours_delivered) > 0 ? Number(hours.hours_attended) : d.total_hours;
  const attendanceRate = hours?.attendance_rate ?? (await computeDossierAttendanceRate(sb, dossierId));

  const branding = await loadOrgBranding(sb as never, d.organization_id);

  const input: CertificatInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
      address: composeAddress(org?.address),
      contactEmail: org?.contact_email ?? null,
      contactPhone: (org as { contact_phone?: string | null } | null)?.contact_phone ?? null,
      certifications: (org as { certifications?: string | null } | null)?.certifications ?? null,
      // Pas d'e-mail en repli : voir build-convention-input.
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
    },
    formation: {
      title: d.formation?.title ?? '—',
    },
    dossier: {
      reference: d.reference,
      startDate: d.start_date,
      endDate: d.end_date,
      plannedHours,
      deliveredHours,
      modality: d.modality,
      attendanceRate,
    },
    generatedAt: new Date(),
  };

  const bytes = await generateCertificatPDF(input);

  if (opts.persist) {
    try {
      await persistGeneratedDocument(sb as never, {
        organizationId: d.organization_id,
        dossierId,
        kind: 'certificat_realisation',
        title: 'Certificat de réalisation',
        bytes,
        generationInput: input,
        // Document vivant : les heures réalisées évoluent jusqu'à la clôture.
        sourceKey: `certificat:${dossierId}`,
        sourceUrl: `/api/dossiers/${dossierId}/certificat.pdf`,
      });
    } catch (e) {
      console.error('[certificat] persist failed', e);
    }
  }

  return {
    bytes,
    reference: d.reference,
    organizationId: d.organization_id,
    learnerName: `${d.learner?.first_name ?? ''} ${d.learner?.last_name ?? ''}`.trim(),
    formationTitle: d.formation?.title ?? 'Formation',
  };
}
