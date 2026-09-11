// Couleur d'identité des formations — palette fixe validée pour les daltonismes
// (sarcelle, indigo, framboise, bleu ciel ; variables --f1…--f4 de globals.css).
// L'orange reste réservé à la marque et aux sessions : aucune formation n'en reçoit.
// Au-delà de quatre formations les teintes se répètent ; le nom reste toujours affiché.
const SLOTS = ['var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'] as const;

export const NEUTRAL_COLOR = 'var(--f-neutral)';

/** Teintes attribuées dans l'ordre de création : une formation garde sa couleur quand d'autres s'ajoutent. */
export function formationColorMap(formations: { id: string; created_at?: string | null }[]): Map<string, string> {
  const ordered = [...formations].sort(
    (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id),
  );
  return new Map(ordered.map((f, i) => [f.id, SLOTS[i % SLOTS.length] ?? NEUTRAL_COLOR]));
}

/** Teinte rapprochée de l'encre : lisible en texte, en clair comme en sombre. */
export function deepColor(color: string): string {
  return `color-mix(in srgb, ${color} 74%, var(--ink))`;
}

export function tintColor(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
