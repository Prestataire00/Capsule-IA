// Mise en forme de ce qui est demandé sur une fiche demande. Module pur.
//
// La base enregistre des nombres bruts — des heures sans unité, un tarif en
// centimes, une date ISO. Affichés tels quels, ils se lisent mal ; mal
// convertis, ils mentent : un tarif en centimes montré en euros annonce cent
// fois le prix, et un champ vide traversé par `Number()` donne « NaN € ».

export const MODALITE_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

/** Rien à afficher : vide, nul, ou pas un nombre. */
const absent = (v: unknown): boolean => v === null || v === undefined || v === '' || !Number.isFinite(Number(v));

/** « 14 » → « 14 h ». La demande enregistre un nombre, pas une unité. */
export const heures = (v: number | string | null | undefined): string =>
  absent(v) || Number(v) <= 0 ? '—' : `${Number(v).toLocaleString('fr-FR')} h`;

/**
 * Centimes → « 1 200 € HT / stagiaire ».
 *
 * L'unité est dite en toutes lettres : le formulaire la précise, le
 * récapitulatif doit la redire, sans quoi on croit lire un total.
 */
export const tarif = (v: number | string | null | undefined): string =>
  absent(v) ? '—' : `${(Number(v) / 100).toLocaleString('fr-FR')} € HT / stagiaire`;

/** « 2026-10-06 » → « 06/10/2026 », à midi UTC pour ne pas changer de jour. */
export const jourFr = (iso: string | null | undefined): string =>
  iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR') : '—';

export const modalite = (v: string | null | undefined): string => MODALITE_LABELS[v ?? ''] ?? '—';
