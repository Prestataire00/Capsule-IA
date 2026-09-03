import { z } from 'zod';

/**
 * Éléments du contrat de sous-traitance que seul l'organisme connaît.
 *
 * Le rédacteur IA a pour consigne de ne jamais inventer une donnée : tout ce
 * qu'il ignore ressort en « [à compléter] », et le contrat arrivait donc troué
 * — objet, dates, rémunération, préavis. On les recueille avant la génération.
 *
 * Tous les champs sont facultatifs : ce qui reste vide sortira en
 * « [à compléter] », comme avant. Remplir n'est jamais bloquant.
 */
export const contractDetailsSchema = z.object({
  /** Art. 1 — intitulé, objectifs, public, contenu, modalités, lieu, volume, effectif. */
  mission: z.string().trim().max(2000).optional().or(z.literal('')),
  /** Art. 2 — période d'exécution. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide').optional().or(z.literal('')),
  /** Art. 2 — dates, horaires et lieux des sessions. */
  schedule: z.string().trim().max(1000).optional().or(z.literal('')),
  /** Art. 6 — montant et base de calcul. */
  feeAmount: z.string().trim().max(120).optional().or(z.literal('')),
  feeBasis: z.enum(['horaire', 'forfaitaire', 'journalier', '']).optional(),
  /** Art. 6 — TVA applicable ou franchise en base. */
  vat: z.string().trim().max(200).optional().or(z.literal('')),
  /** Art. 13 — préavis de résiliation hors faute, en jours. */
  noticeDays: z
    .union([z.literal(''), z.coerce.number().int().min(0).max(365)])
    .optional(),
  /** Art. 9 — sort des supports créés par le sous-traitant. */
  ipTerms: z.enum(['cession', 'licence', 'usage', '']).optional(),
  /** Bloc final — lieu de signature. */
  signaturePlace: z.string().trim().max(120).optional().or(z.literal('')),
});

export type ContractDetails = z.infer<typeof contractDetailsSchema>;

const BASES: Record<string, string> = {
  horaire: 'taux horaire',
  journalier: 'tarif journalier',
  forfaitaire: 'forfait global',
};

const IP: Record<string, string> = {
  cession:
    'Le sous-traitant cède au donneur d’ordre, à titre exclusif, les droits patrimoniaux sur les supports qu’il crée dans le cadre de la mission.',
  licence:
    'Le sous-traitant concède au donneur d’ordre une licence non exclusive d’utilisation des supports qu’il crée, pour les besoins des actions de formation concernées.',
  usage:
    'Le sous-traitant conserve la propriété des supports qu’il crée et en concède l’usage au donneur d’ordre pour la seule action de formation objet du contrat.',
};

const dateFr = (iso: string): string =>
  iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${iso}T12:00:00`)) : '';

/**
 * Traduit la saisie en variables lisibles par le rédacteur IA. Une valeur vide
 * est **omise** : le contexte ne liste que le renseigné, et le rédacteur remet
 * un « [à compléter] » sur le reste.
 */
export function contractVariables(d: ContractDetails): Record<string, string> {
  const v: Record<string, string> = {};
  if (d.mission) v['contrat_objet'] = d.mission;
  if (d.startDate) v['contrat_date_debut'] = dateFr(d.startDate);
  if (d.endDate) v['contrat_date_fin'] = dateFr(d.endDate);
  if (d.schedule) v['contrat_calendrier'] = d.schedule;

  if (d.feeAmount) {
    const base = d.feeBasis ? BASES[d.feeBasis] : undefined;
    v['contrat_remuneration'] = base ? `${d.feeAmount} (${base})` : d.feeAmount;
  }
  if (d.vat) v['contrat_tva'] = d.vat;
  if (d.noticeDays !== '' && d.noticeDays !== undefined) {
    v['contrat_preavis_jours'] = String(d.noticeDays);
  }
  if (d.ipTerms) v['contrat_propriete_intellectuelle'] = IP[d.ipTerms] ?? '';
  if (d.signaturePlace) v['contrat_lieu_signature'] = d.signaturePlace;
  return v;
}
