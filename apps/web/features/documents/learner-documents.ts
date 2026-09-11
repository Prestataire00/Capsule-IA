import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAttestationPDF, type AttestationInput } from './generate-attestation-pdf';
import { generateProgrammePDF, type ProgrammeInput } from './generate-programme-pdf';
import { generateConventionPDF } from './generate-convention-pdf';
import { buildConventionInput } from './build-convention-input';
import { buildCertificatPdf } from './build-certificat-pdf';
import { buildConvocationPdf } from './build-convocation-pdf';
import { loadOrgBranding } from './load-org-branding';
import { computeDossierAttendanceRate } from '@/features/attendance/attendance-rate';

/**
 * Documents d'un stagiaire, au même endroit que dans RFC : la séance les
 * énumère, les affiche, les envoie par e-mail et les met en signature. Les
 * routes `/api/dossiers/[id]/*.pdf` servent l'aperçu ; ici on produit les
 * octets, pour l'e-mail et la signature.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export const LEARNER_DOCUMENT_TYPES = [
  { type: 'convocation', label: 'Convocation', kind: 'convocation', signable: true },
  { type: 'convention', label: 'Convention / contrat', kind: 'convention', signable: true },
  { type: 'attestation_entree', label: "Attestation d'entrée", kind: 'attestation_entree', signable: false },
  { type: 'attestation_fin', label: 'Attestation de fin', kind: 'attestation_fin', signable: false },
  { type: 'certificat', label: 'Certificat de réalisation', kind: 'certificat_realisation', signable: false },
  { type: 'programme', label: 'Programme', kind: 'programme', signable: false },
] as const;

export type LearnerDocumentType = (typeof LEARNER_DOCUMENT_TYPES)[number]['type'];

export const isLearnerDocumentType = (v: string): v is LearnerDocumentType =>
  LEARNER_DOCUMENT_TYPES.some((d) => d.type === v);

export const learnerDocumentMeta = (type: LearnerDocumentType) =>
  LEARNER_DOCUMENT_TYPES.find((d) => d.type === type)!;

/** URL d'aperçu (route déjà gardée par `canAccessDossier`). */
export function learnerDocumentUrl(type: LearnerDocumentType, dossierId: string, sessionId: string): string {
  switch (type) {
    case 'convocation':
      return `/api/dossiers/${dossierId}/convocation.pdf?session=${sessionId}`;
    case 'convention':
      return `/api/dossiers/${dossierId}/convention.pdf`;
    case 'attestation_entree':
      return `/api/dossiers/${dossierId}/attestation-entree.pdf`;
    case 'attestation_fin':
      return `/api/dossiers/${dossierId}/attestation.pdf`;
    case 'certificat':
      return `/api/dossiers/${dossierId}/certificat.pdf`;
    case 'programme':
      return `/api/dossiers/${dossierId}/programme.pdf`;
  }
}

export type BuiltLearnerDocument = {
  readonly bytes: Uint8Array;
  readonly title: string;
  readonly filename: string;
  readonly organizationId: string;
  readonly kind: string;
  /** Entrée de génération conservée avec le document archivé. */
  readonly generationInput: unknown;
};

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

const adresse = (a: AddressJson | null | undefined): string | null => {
  if (!a || typeof a !== 'object') return null;
  const parts = [
    [a.line1, a.line2].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter((p) => p && p.trim() !== '');
  return parts.length ? parts.join(', ') : null;
};

/** Socle commun des attestations (entrée et fin) : mêmes données, deux variantes. */
async function buildAttestationInput(
  sb: Client,
  dossierId: string,
  variant: 'entree' | 'fin',
): Promise<{ input: AttestationInput; organizationId: string; reference: string } | null> {
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'reference, start_date, end_date, total_hours, modality, organization_id, learner:learners(first_name, last_name, email, birth_date), formation:formations(title, objectives)',
    )
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as unknown as {
    reference: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    organization_id: string;
    learner: { first_name: string; last_name: string; email: string; birth_date: string | null } | null;
    formation: { title: string; objectives: string[] | null } | null;
  } | null;
  if (!d) return null;

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .eq('id', d.organization_id)
    .maybeSingle();
  const org = orgData as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
  } | null;

  const branding = await loadOrgBranding(sb as never, d.organization_id);
  const attendanceRate = variant === 'fin' ? await computeDossierAttendanceRate(sb as never, dossierId) : 0;

  return {
    organizationId: d.organization_id,
    reference: d.reference,
    input: {
      organization: {
        name: org?.name ?? 'Organisme de formation',
        siret: org?.siret ?? null,
        nda: org?.declaration_activite ?? null,
        address: adresse(org?.address),
        contactEmail: org?.contact_email ?? null,
        contactPhone: (org as { contact_phone?: string | null } | null)?.contact_phone ?? null,
        certifications: (org as { certifications?: string | null } | null)?.certifications ?? null,
        representativeName: branding.representativeName ?? org?.contact_email ?? null,
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
      formation: { title: d.formation?.title ?? '—', objectives: d.formation?.objectives ?? [] },
      dossier: {
        reference: d.reference,
        startDate: d.start_date,
        endDate: d.end_date,
        totalHours: d.total_hours,
        modality: d.modality,
        attendanceRate,
      },
      generatedAt: new Date(),
      ...(variant === 'entree' ? { variant: 'entree' as const } : {}),
    },
  };
}

async function buildProgrammeBytes(
  sb: Client,
  dossierId: string,
): Promise<{ input: ProgrammeInput; organizationId: string; reference: string } | null> {
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'reference, start_date, end_date, total_hours, modality, total_amount_cents, currency, accessibility_notes, organization_id, formation:formations(title, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method)',
    )
    .eq('id', dossierId)
    .maybeSingle();
  const d = data as unknown as {
    reference: string;
    start_date: string;
    end_date: string;
    total_hours: number;
    modality: string;
    total_amount_cents: number | null;
    currency: string;
    accessibility_notes: string | null;
    organization_id: string;
    formation: {
      title: string;
      objectives: string[] | null;
      prerequisites: string[] | null;
      target_audience: string | null;
      evaluation_method: string | null;
      pedagogical_method: string | null;
    } | null;
  } | null;
  if (!d) return null;

  const { data: orgData } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .eq('id', d.organization_id)
    .maybeSingle();
  const org = orgData as { name: string; siret: string | null; declaration_activite: string | null; address: AddressJson | null } | null;

  const { data: modulesData } = await sb
    .schema('app')
    .from('dossier_modules')
    .select('position, title_snapshot, duration_hours, start_date, end_date')
    .eq('dossier_id', dossierId)
    .order('position', { ascending: true });
  const modules = (modulesData ?? []) as Array<{
    position: number;
    title_snapshot: string;
    duration_hours: number;
    start_date: string | null;
    end_date: string | null;
  }>;

  const { data: sessionsData } = await sb
    .schema('app')
    .from('sessions')
    .select('starts_at, ends_at, location, remote_url, zoom_join_url')
    .eq('dossier_id', dossierId)
    .order('starts_at', { ascending: true });
  const seances = (sessionsData ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    location: string | null;
    remote_url: string | null;
    zoom_join_url: string | null;
  }>;

  const branding = await loadOrgBranding(sb as never, d.organization_id);

  return {
    organizationId: d.organization_id,
    reference: d.reference,
    input: {
      organization: {
        name: org?.name ?? 'Organisme de formation',
        siret: org?.siret ?? null,
        nda: org?.declaration_activite ?? null,
        address: adresse(org?.address),
        contactEmail: (org as { contact_email?: string | null } | null)?.contact_email ?? null,
        contactPhone: (org as { contact_phone?: string | null } | null)?.contact_phone ?? null,
        certifications: (org as { certifications?: string | null } | null)?.certifications ?? null,
      },
      logoPng: branding.logoPng,
      formation: {
        title: d.formation?.title ?? '—',
        objectives: d.formation?.objectives ?? [],
        prerequisites: d.formation?.prerequisites ?? [],
        targetAudience: d.formation?.target_audience ?? null,
        evaluationMethod: d.formation?.evaluation_method ?? null,
        pedagogicalMethod: d.formation?.pedagogical_method ?? null,
      },
      dossier: {
        reference: d.reference,
        startDate: d.start_date,
        endDate: d.end_date,
        totalHours: d.total_hours,
        modality: d.modality,
        totalAmountCents: d.total_amount_cents,
        currency: d.currency,
        accessibilityNotes: d.accessibility_notes,
      },
      modules: modules.map((m) => ({
        position: m.position,
        title: m.title_snapshot,
        durationHours: m.duration_hours,
        startDate: m.start_date,
        endDate: m.end_date,
      })),
      sessions: seances.map((s) => ({
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        location: s.location,
        remoteUrl: s.remote_url ?? s.zoom_join_url,
      })),
      generatedAt: new Date(),
    },
  };
}

/** Produit les octets d'un document de stagiaire. Ne persiste rien : l'appelant décide. */
export async function buildLearnerDocument(
  sb: Client,
  args: { type: LearnerDocumentType; dossierId: string; sessionId: string },
): Promise<BuiltLearnerDocument | null> {
  const meta = learnerDocumentMeta(args.type);

  if (args.type === 'convocation') {
    const built = await buildConvocationPdf(sb, { sessionId: args.sessionId, dossierId: args.dossierId });
    if (!built) return null;
    return {
      bytes: built.bytes,
      title: built.title,
      filename: built.filename,
      organizationId: built.organizationId,
      kind: meta.kind,
      generationInput: { session_id: args.sessionId, dossier_id: args.dossierId },
    };
  }

  if (args.type === 'convention') {
    const built = await buildConventionInput(sb as never, args.dossierId, null);
    if (!built) return null;
    const bytes = await generateConventionPDF(built.input);
    return {
      bytes,
      title: 'Convention de formation',
      filename: `convention-${built.input.dossier.reference}.pdf`,
      organizationId: built.organizationId,
      kind: meta.kind,
      generationInput: built.input,
    };
  }

  if (args.type === 'certificat') {
    const built = await buildCertificatPdf(sb as never, args.dossierId);
    if (!built) return null;
    return {
      bytes: built.bytes,
      title: 'Certificat de réalisation',
      filename: `certificat-${built.reference}.pdf`,
      organizationId: built.organizationId,
      kind: meta.kind,
      generationInput: { dossier_id: args.dossierId },
    };
  }

  if (args.type === 'programme') {
    const built = await buildProgrammeBytes(sb, args.dossierId);
    if (!built) return null;
    const bytes = await generateProgrammePDF(built.input);
    return {
      bytes,
      title: 'Programme de formation',
      filename: `programme-${built.reference}.pdf`,
      organizationId: built.organizationId,
      kind: meta.kind,
      generationInput: built.input,
    };
  }

  const variant = args.type === 'attestation_entree' ? 'entree' : 'fin';
  const built = await buildAttestationInput(sb, args.dossierId, variant);
  if (!built) return null;
  const bytes = await generateAttestationPDF(built.input);
  return {
    bytes,
    title: variant === 'entree' ? "Attestation d'entrée en formation" : 'Attestation de fin de formation',
    filename: `${variant === 'entree' ? 'attestation-entree' : 'attestation'}-${built.reference}.pdf`,
    organizationId: built.organizationId,
    kind: meta.kind,
    generationInput: built.input,
  };
}
