import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateLegalDocPDF } from '@/features/documents/generate-legal-doc-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import type { SeanceEspace } from './espace-complet';

/**
 * La convocation générale d'une entreprise : toutes ses séances à venir, avec
 * leurs participants, en un document (demande d'Ismael, 07/10/2026). Produite
 * à la demande depuis l'espace, donc toujours à jour — un changement d'horaire
 * ou de groupe s'y lit aussitôt.
 */

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };
const adresse = (a: AddressJson | null | undefined): string | null => {
  if (!a || typeof a !== 'object') return null;
  const parts = [[a.line1, a.line2].filter(Boolean).join(' '), [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(
    (p) => p && p.trim() !== '',
  );
  return parts.length ? parts.join(', ') : null;
};
const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'À distance', hybride: 'Hybride' };
const jour = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full' }).format(new Date(iso));
const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const premiereMajuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Les lignes du document : une section par séance. Pur. */
export function lignesConvocationGenerale(seances: readonly SeanceEspace[], entreprise: string | null): string[] {
  const formations = [...new Set(seances.map((s) => s.formation))];
  return [
    '### Formation',
    '',
    ...formations.map((f) => `Intitulé : ${f}`),
    entreprise ? `Client : ${entreprise}` : null,
    `Séances : ${seances.length}`,
    '',
    ...seances.flatMap((s) => [
      `### ${premiereMajuscule(jour(s.debut))}${s.groupe ? ` · ${s.groupe}` : ''}`,
      '',
      `Horaires : ${heure(s.debut)} - ${heure(s.fin)}`,
      `Modalité : ${MODALITE[s.modalite] ?? s.modalite}`,
      s.lieu ? `Lieu : ${s.lieu}` : null,
      s.visio ? `Lien de connexion : ${s.visio}` : null,
      s.formateurs.length ? `Formateur : ${s.formateurs.join(', ')}` : null,
      `Participants (${s.participants.length}) : ${s.participants.join(', ') || 'à confirmer'}`,
      '',
    ]),
    '### Informations pratiques',
    '',
    "Merci de vous présenter 10 minutes avant le début de chaque séance. La présence est attestée par l'émargement de chaque demi-journée.",
    '',
    "En cas d'empêchement, prévenez l'organisme au plus tôt afin de replanifier.",
  ].filter((l): l is string => l !== null);
}

export async function construireConvocationGenerale(input: {
  organizationId: string;
  entreprise: string | null;
  seances: readonly SeanceEspace[];
}): Promise<{ bytes: Uint8Array; filename: string }> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('name, siret, declaration_activite, address, contact_email, contact_phone, certifications')
    .eq('id', input.organizationId)
    .maybeSingle();
  const org = data as {
    name: string;
    siret: string | null;
    declaration_activite: string | null;
    address: AddressJson | null;
    contact_email: string | null;
    contact_phone: string | null;
    certifications: string | null;
  } | null;
  const branding = await loadOrgBranding(sb as never, input.organizationId);
  const bytes = await generateLegalDocPDF({
    title: input.entreprise ? `Convocation — ${input.entreprise}` : 'Convocation',
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
    contentMd: lignesConvocationGenerale(input.seances, input.entreprise).join('\n'),
  });
  const nom = (input.entreprise ?? 'entreprise').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { bytes, filename: `convocation-${nom || 'entreprise'}.pdf` };
}
