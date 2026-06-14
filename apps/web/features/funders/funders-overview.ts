// Helpers purs pour la vue financeurs (zéro I/O).

export function countByKind(kinds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of kinds) out[k] = (out[k] ?? 0) + 1;
  return out;
}

const EURO = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

export function formatEurosCents(cents: number): string {
  return EURO.format((cents ?? 0) / 100);
}
