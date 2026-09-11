/**
 * Versions du référentiel national qualité et date d'effet.
 *
 * La V9 (32 indicateurs) s'applique jusqu'au 31 octobre 2026 ; la V10
 * (33 indicateurs, décret n° 2026-728) à partir du 1er novembre 2026. Les
 * deux coexistent en base : on affiche celle en vigueur, et l'on peut
 * consulter la suivante pour s'y préparer.
 */
export type VersionRow = {
  readonly referential_version: string;
  readonly effective_from: string | null;
  readonly effective_until: string | null;
};

export const VERSION_LABELS: Record<string, string> = {
  v9: 'guide de lecture V9',
  v10: 'décret n° 2026-728 (V10)',
};

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function jourParis(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
}

export function enVigueur(row: VersionRow, jour: string): boolean {
  return (row.effective_from === null || row.effective_from <= jour) && (row.effective_until === null || row.effective_until >= jour);
}

/**
 * Version en vigueur, et la prochaine si elle est déjà connue. L'ancien jeu
 * mal numéroté (« legacy ») n'est jamais retenu.
 */
export function versions(rows: readonly VersionRow[], jour: string): { courante: string | null; suivante: { version: string; from: string } | null } {
  const officielles = rows.filter((r) => r.referential_version !== 'legacy');
  const courante = officielles.find((r) => enVigueur(r, jour))?.referential_version ?? null;
  const futures = officielles
    .filter((r) => r.effective_from !== null && r.effective_from > jour)
    .sort((a, b) => (a.effective_from! < b.effective_from! ? -1 : 1));
  const f = futures[0];
  return { courante, suivante: f ? { version: f.referential_version, from: f.effective_from! } : null };
}
