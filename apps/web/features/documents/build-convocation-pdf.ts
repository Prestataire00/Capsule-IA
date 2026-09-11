import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateLegalDocPDF } from './generate-legal-doc-pdf';
import { loadOrgBranding } from './load-org-branding';

/**
 * Convocation d'un apprenant à une séance.
 *
 * Il n'existait qu'un e-mail de convocation (J-7) : rien à joindre, rien à
 * archiver, rien à faire signer. Ce PDF reprend les mentions attendues d'une
 * convocation : identité de l'organisme, apprenant, formation, date, horaires,
 * modalité, lieu (ou lien de visio) et formateur.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type BuiltConvocation = {
  readonly bytes: Uint8Array;
  readonly title: string;
  readonly filename: string;
  readonly organizationId: string;
  readonly learnerEmail: string | null;
  readonly learnerName: string;
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

const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

const jour = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full' }).format(new Date(iso));
const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export async function buildConvocationPdf(
  sb: Client,
  args: { sessionId: string; dossierId: string },
): Promise<BuiltConvocation | null> {
  const { data: sRow } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, title, starts_at, ends_at, modality, location, remote_url, zoom_join_url, formation_id')
    .eq('id', args.sessionId)
    .maybeSingle();
  const session = sRow as {
    id: string;
    organization_id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    modality: string;
    location: string | null;
    remote_url: string | null;
    zoom_join_url: string | null;
    formation_id: string | null;
  } | null;
  if (!session) return null;

  const { data: dRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, organization_id, learner:learners(first_name, last_name, email), formation:formations(title)')
    .eq('id', args.dossierId)
    .eq('organization_id', session.organization_id)
    .maybeSingle();
  const dossier = dRow as unknown as {
    id: string;
    reference: string;
    learner: { first_name: string; last_name: string; email: string | null } | null;
    formation: { title: string } | null;
  } | null;
  if (!dossier) return null;

  const { data: orgRow } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address')
    .eq('id', session.organization_id)
    .maybeSingle();
  const org = orgRow as { name: string; siret: string | null; declaration_activite: string | null; address: AddressJson | null } | null;

  // Formateur de la séance (le premier rattaché) — information attendue sur une convocation.
  const { data: stRows } = await sb
    .schema('app')
    .from('session_trainers')
    .select('trainer_id')
    .eq('session_id', session.id)
    .is('deleted_at', null)
    .limit(1);
  const trainerId = ((stRows ?? []) as { trainer_id: string }[])[0]?.trainer_id ?? null;
  const { data: tRow } = trainerId
    ? await sb.schema('app').from('trainers').select('first_name, last_name').eq('id', trainerId).maybeSingle()
    : { data: null };
  const trainer = tRow as { first_name: string | null; last_name: string | null } | null;
  const trainerName = trainer ? `${trainer.first_name ?? ''} ${trainer.last_name ?? ''}`.trim() : null;

  const formationTitle = dossier.formation?.title ?? session.title ?? 'Formation';
  const learnerName = `${dossier.learner?.first_name ?? ''} ${dossier.learner?.last_name ?? ''}`.trim() || 'Apprenant';
  const lienVisio = session.zoom_join_url ?? session.remote_url;

  const lignes = [
    `### ${formationTitle}`,
    '',
    `Apprenant : ${learnerName}`,
    `Dossier : ${dossier.reference}`,
    '',
    '### Détails de la convocation',
    '',
    `Date : ${jour(session.starts_at)}`,
    `Horaires : ${heure(session.starts_at)} - ${heure(session.ends_at)}`,
    `Modalité : ${MODALITE[session.modality] ?? session.modality}`,
    session.location ? `Lieu : ${session.location}` : null,
    lienVisio ? `Lien de connexion : ${lienVisio}` : null,
    trainerName ? `Formateur : ${trainerName}` : null,
    '',
    'Merci de vous présenter 10 minutes avant le début de la séance. La présence',
    "est attestée par l'émargement de chaque demi-journée.",
    '',
    "En cas d'empêchement, prévenez l'organisme au plus tôt afin de replanifier.",
    org?.siret ? `` : null,
  ].filter((l): l is string => l !== null);

  const branding = await loadOrgBranding(sb as never, session.organization_id);
  const bytes = await generateLegalDocPDF({
    title: 'Convocation à une session de formation',
    organization: {
      name: org?.name ?? 'Organisme de formation',
      nda: org?.declaration_activite ?? null,
      address: adresse(org?.address),
    },
    logoPng: branding.logoPng,
    contentMd: lignes.join('\n'),
  });

  return {
    bytes,
    title: `Convocation — ${formationTitle}`,
    filename: `convocation-${dossier.reference}.pdf`,
    organizationId: session.organization_id,
    learnerEmail: dossier.learner?.email ?? null,
    learnerName,
  };
}
