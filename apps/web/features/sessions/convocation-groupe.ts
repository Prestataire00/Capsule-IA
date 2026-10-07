import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateLegalDocPDF } from '@/features/documents/generate-legal-doc-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { lignesParticipants, nomFichierConvocation, trierParticipants, type ParticipantConvoque } from './convocation-groupe-contenu';

/**
 * Convocation d'un groupe à une séance : un seul document qui dit au client
 * qui vient, quand et où. La liste est celle des participants de la séance —
 * celle que le choix du groupe met à jour —, pas celle des dossiers : un
 * dossier d'entreprise réunit tous les salariés, quel que soit leur groupe.
 *
 * Appelé après vérification de l'accès à la séance (lecture sous RLS) ; lit
 * ensuite en service role.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

const adresse = (a: AddressJson | null | undefined): string | null => {
  if (!a || typeof a !== 'object') return null;
  const parts = [[a.line1, a.line2].filter(Boolean).join(' '), [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(
    (p) => p && p.trim() !== '',
  );
  return parts.length ? parts.join(', ') : null;
};

const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };
const jourLong = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full' }).format(new Date(iso));
const jourIso = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso));
const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const heures = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export type Seance = {
  readonly id: string;
  readonly organizationId: string;
  readonly titre: string | null;
  readonly debut: string;
  readonly fin: string;
  readonly dureeHeures: number | null;
  readonly modalite: string;
  readonly lieu: string | null;
  readonly visio: string | null;
  readonly formation: string;
  readonly groupe: string | null;
  readonly formateur: string | null;
  readonly dossierIds: readonly string[];
};

export async function chargerSeance(sb: Client, sessionId: string): Promise<Seance | null> {
  const { data: s } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, title, starts_at, ends_at, duration_hours, modality, location, remote_url, zoom_join_url, formation_id, dossier_id, groupe_id')
    .eq('id', sessionId)
    .maybeSingle();
  const seance = s as {
    id: string;
    organization_id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    duration_hours: number | null;
    modality: string;
    location: string | null;
    remote_url: string | null;
    zoom_join_url: string | null;
    formation_id: string | null;
    dossier_id: string | null;
    groupe_id: string | null;
  } | null;
  if (!seance) return null;

  const [{ data: liens }, { data: groupe }, { data: st }] = await Promise.all([
    sb.schema('app').from('session_dossiers').select('dossier_id').eq('session_id', sessionId),
    seance.groupe_id
      ? sb.schema('app').from('dossier_groupes').select('nom').eq('id', seance.groupe_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sb.schema('app').from('session_trainers').select('trainer:trainers(first_name, last_name)').eq('session_id', sessionId).is('deleted_at', null),
  ]);
  const dossierIds = [
    ...new Set([seance.dossier_id, ...((liens ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id)].filter((v): v is string => Boolean(v))),
  ];

  let formationId = seance.formation_id;
  if (!formationId && dossierIds.length) {
    const { data: d } = await sb.schema('app').from('dossiers').select('formation_id').in('id', dossierIds).not('formation_id', 'is', null).limit(1);
    formationId = ((d ?? []) as Array<{ formation_id: string }>)[0]?.formation_id ?? null;
  }
  const { data: f } = formationId
    ? await sb.schema('app').from('formations').select('title').eq('id', formationId).maybeSingle()
    : { data: null };

  const formateurs = ((st ?? []) as unknown as Array<{ trainer: { first_name: string | null; last_name: string | null } | null }>)
    .map((t) => `${t.trainer?.first_name ?? ''} ${t.trainer?.last_name ?? ''}`.trim())
    .filter(Boolean);

  return {
    id: seance.id,
    organizationId: seance.organization_id,
    titre: seance.title,
    debut: seance.starts_at,
    fin: seance.ends_at,
    dureeHeures: seance.duration_hours === null ? null : Number(seance.duration_hours),
    modalite: seance.modality,
    lieu: seance.location,
    visio: seance.zoom_join_url ?? seance.remote_url,
    formation: (f as { title: string } | null)?.title ?? seance.title ?? 'Formation',
    groupe: (groupe as { nom: string } | null)?.nom ?? null,
    formateur: formateurs.length ? formateurs.join(', ') : null,
    dossierIds,
  };
}

/**
 * Les stagiaires attendus à la séance, avec leur entreprise : la fiche de
 * l'apprenant d'abord, sinon l'entreprise du dossier qui l'inscrit.
 */
export async function participantsConvoques(sb: Client, seance: Seance): Promise<ParticipantConvoque[]> {
  const { data: rows } = await sb
    .schema('app')
    .from('session_participants')
    .select('learner_id, source')
    .eq('session_id', seance.id)
    .eq('participant_kind', 'learner');
  const ids = [
    ...new Set(
      ((rows ?? []) as Array<{ learner_id: string | null; source: string | null }>)
        .filter((r) => r.learner_id && r.source !== 'manual_remove')
        .map((r) => r.learner_id as string),
    ),
  ];
  if (ids.length === 0) return [];

  const [{ data: learners }, { data: principaux }, { data: rattaches }] = await Promise.all([
    sb.schema('app').from('learners').select('id, first_name, last_name, email, company_id').in('id', ids).is('deleted_at', null),
    seance.dossierIds.length
      ? sb.schema('app').from('dossiers').select('learner_id, company_id').in('id', [...seance.dossierIds])
      : Promise.resolve({ data: [] }),
    seance.dossierIds.length
      ? sb.schema('app').from('dossier_learners').select('learner_id, dossier:dossiers(company_id)').in('dossier_id', [...seance.dossierIds])
      : Promise.resolve({ data: [] }),
  ]);
  const entrepriseDuDossier = new Map<string, string>();
  for (const d of (principaux ?? []) as Array<{ learner_id: string | null; company_id: string | null }>) {
    if (d.learner_id && d.company_id) entrepriseDuDossier.set(d.learner_id, d.company_id);
  }
  for (const r of (rattaches ?? []) as unknown as Array<{ learner_id: string; dossier: { company_id: string | null } | null }>) {
    if (r.dossier?.company_id && !entrepriseDuDossier.has(r.learner_id)) entrepriseDuDossier.set(r.learner_id, r.dossier.company_id);
  }

  return trierParticipants(
    ((learners ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null; company_id: string | null }>).map(
      (l) => ({
        id: l.id,
        prenom: l.first_name?.trim() ?? '',
        nom: l.last_name?.trim() ?? '',
        email: l.email,
        companyId: l.company_id ?? entrepriseDuDossier.get(l.id) ?? null,
      }),
    ),
  );
}

export type ConvocationGroupe = { readonly bytes: Uint8Array; readonly filename: string; readonly titre: string };

/** Le PDF à la charte, pour ces participants (tous, ou ceux d'une entreprise). */
export async function construireConvocationGroupe(
  sb: Client,
  seance: Seance,
  participants: readonly ParticipantConvoque[],
  client: string | null,
): Promise<ConvocationGroupe> {
  const { data: orgRow } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .eq('id', seance.organizationId)
    .maybeSingle();
  const org = orgRow as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    contact_phone: string | null;
    certifications: string | null;
  } | null;

  const lignes = [
    '### Formation',
    '',
    `Intitulé : ${seance.formation}`,
    client ? `Client : ${client}` : null,
    seance.groupe ? `Groupe : ${seance.groupe}` : null,
    '',
    '### Séance',
    '',
    `Date : ${jourLong(seance.debut)}`,
    `Horaires : ${heure(seance.debut)} - ${heure(seance.fin)}`,
    seance.dureeHeures ? `Durée : ${heures.format(seance.dureeHeures)} h` : null,
    `Modalité : ${MODALITE[seance.modalite] ?? seance.modalite}`,
    seance.lieu ? `Lieu : ${seance.lieu}` : null,
    seance.visio && seance.modalite !== 'presentiel' ? `Lien de connexion : ${seance.visio}` : null,
    seance.formateur ? `Formateur : ${seance.formateur}` : null,
    '',
    `### Participants convoqués (${participants.length})`,
    '',
    ...(participants.length ? lignesParticipants(participants) : ['Aucun participant inscrit à cette séance pour le moment.']),
    '',
    '### Informations pratiques',
    '',
    "Merci de vous présenter 10 minutes avant le début de la séance. La présence est attestée par l'émargement de chaque demi-journée.",
    '',
    "En cas d'empêchement, prévenez l'organisme au plus tôt afin de replanifier.",
  ].filter((l): l is string => l !== null);

  const branding = await loadOrgBranding(sb as never, seance.organizationId);
  const titreDoc = seance.groupe ? `Convocation — ${seance.groupe}` : 'Convocation des participants';
  const bytes = await generateLegalDocPDF({
    title: titreDoc,
    organization: {
      name: org?.name ?? 'Organisme de formation',
      nda: org?.declaration_activite ?? null,
      address: adresse(org?.address),
      siret: org?.siret ?? null,
      contactEmail: org?.contact_email ?? null,
      contactPhone: org?.contact_phone ?? null,
      certifications: org?.certifications ?? null,
    },
    logoPng: branding.logoPng,
    contentMd: lignes.join('\n'),
  });

  return { bytes, filename: nomFichierConvocation(seance.groupe, seance.debut, jourIso(seance.debut)), titre: `${titreDoc} — ${seance.formation}` };
}
