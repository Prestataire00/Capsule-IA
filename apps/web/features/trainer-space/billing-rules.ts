import { dayKey } from '@/features/trainer-space/dates';

/**
 * Règles de facturation des formateurs, pures et testables.
 *
 * Le tarif est saisi par l'organisme sur la fiche du formateur, avec sa base :
 * à l'heure, à la journée ou à la séance. Chaque séance terminée donne une
 * ligne calculée ; un tarif particulier posé sur la séance (forfait ou taux
 * horaire) l'emporte sur celui de la fiche.
 */

export type TarifBase = 'heure' | 'jour' | 'session';

export const TARIF_BASES: { value: TarifBase; label: string; unite: string }[] = [
  { value: 'heure', label: 'À l’heure', unite: 'heure' },
  { value: 'jour', label: 'À la journée', unite: 'jour' },
  { value: 'session', label: 'À la séance', unite: 'séance' },
];

export const estTarifBase = (v: unknown): v is TarifBase => v === 'heure' || v === 'jour' || v === 'session';

export type SeanceFacturable = {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly forfaitCents?: number | null;
  readonly tauxHoraireCents?: number | null;
};

export type LigneCalculee = {
  readonly sessionId: string;
  readonly label: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceCents: number;
  readonly totalCents: number;
};

const JOUR_MS = 24 * 60 * 60 * 1000;
const arrondi2 = (n: number) => Math.round(n * 100) / 100;

export const dureeHeures = (startsAt: string, endsAt: string) =>
  arrondi2(Math.max(0, Date.parse(endsAt) - Date.parse(startsAt)) / 3_600_000);

/** Jours facturés : un par date (à Paris) ; une séance de 4 h ou moins compte pour ½ jour. */
export function joursFactures(startsAt: string, endsAt: string): number {
  const debut = dayKey(startsAt);
  const fin = dayKey(endsAt);
  if (debut !== fin) return Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${debut}T12:00:00Z`)) / JOUR_MS) + 1;
  return dureeHeures(startsAt, endsAt) <= 4 ? 0.5 : 1;
}

const dateCourte = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

export function ligneSeance(s: SeanceFacturable, base: TarifBase | null, tarifCents: number | null): LigneCalculee | null {
  const label = `${s.title} — séance du ${dateCourte(s.startsAt)}`;
  if (s.forfaitCents != null) {
    return { sessionId: s.id, label, quantity: 1, unit: 'forfait', unitPriceCents: s.forfaitCents, totalCents: s.forfaitCents };
  }
  if (s.tauxHoraireCents != null) {
    const q = dureeHeures(s.startsAt, s.endsAt);
    return q > 0 ? { sessionId: s.id, label, quantity: q, unit: 'heure', unitPriceCents: s.tauxHoraireCents, totalCents: Math.round(q * s.tauxHoraireCents) } : null;
  }
  if (!base || tarifCents == null) return null;
  const quantity = base === 'heure' ? dureeHeures(s.startsAt, s.endsAt) : base === 'jour' ? joursFactures(s.startsAt, s.endsAt) : 1;
  if (quantity <= 0) return null;
  const unit = TARIF_BASES.find((b) => b.value === base)?.unite ?? base;
  return { sessionId: s.id, label, quantity, unit, unitPriceCents: tarifCents, totalCents: Math.round(quantity * tarifCents) };
}

export type RegimeTva = 'franchise' | 'assujetti';

export function totaux(lignes: readonly { totalCents: number }[], regime: RegimeTva, tauxTva: number) {
  const subtotalCents = lignes.reduce((s, l) => s + l.totalCents, 0);
  const vatCents = regime === 'assujetti' ? Math.round((subtotalCents * tauxTva) / 100) : 0;
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

export const MENTION_FRANCHISE = 'TVA non applicable, art. 293 B du CGI';
export const MENTION_PENALITES =
  'En cas de retard de paiement : pénalités au taux de trois fois l’intérêt légal et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L. 441-10 du Code de commerce). Pas d’escompte pour paiement anticipé.';

export const formatEuros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

/** « 1 234,50 » → 123450 ; `null` si la saisie n'est pas un montant. */
export function eurosEnCentimes(v: string): number | null {
  const t = v.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export const CATEGORIES_FRAIS: Record<string, string> = {
  transport: 'Transport',
  repas: 'Repas',
  hebergement: 'Hébergement',
  materiel: 'Matériel',
  autre: 'Autre',
};

export type Ton = 'info' | 'success' | 'warning' | 'danger';

export const STATUT_FACTURE: Record<string, { label: string; ton: Ton }> = {
  soumise: { label: 'Envoyée', ton: 'info' },
  validee: { label: 'Validée', ton: 'success' },
  refusee: { label: 'Refusée', ton: 'danger' },
  payee: { label: 'Payée', ton: 'success' },
};

export const STATUT_FRAIS: Record<string, { label: string; ton: Ton }> = {
  soumise: { label: 'Envoyée', ton: 'info' },
  validee: { label: 'Validée', ton: 'success' },
  refusee: { label: 'Refusée', ton: 'danger' },
  remboursee: { label: 'Remboursée', ton: 'success' },
};

export const CLASSES_TON: Record<Ton, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

/** Adresse d'un organisme (objet JSON de forme variable) en lignes imprimables. */
export function adresseLignes(adresse: unknown): string[] {
  if (typeof adresse === 'string') return adresse.trim() ? [adresse.trim()] : [];
  if (!adresse || typeof adresse !== 'object') return [];
  const a = adresse as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '');
  const rue = [s('line1') || s('street') || s('address') || s('adresse'), s('line2')].filter(Boolean);
  const ville = [s('postal_code') || s('zip') || s('code_postal'), s('city') || s('ville')].filter(Boolean).join(' ');
  const pays = s('country') && s('country') !== 'France' ? s('country') : '';
  return [...rue, ville, pays].filter(Boolean);
}
