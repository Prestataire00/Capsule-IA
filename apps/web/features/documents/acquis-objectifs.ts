// Acquis par objectif du programme, pour l'attestation de fin de formation
// (0234, réunion avec Laurie, 16/10/2026). Pur.

export const NIVEAUX_ACQUIS = ['acquis', 'en_cours', 'non_acquis'] as const;
export type NiveauAcquis = (typeof NIVEAUX_ACQUIS)[number];

export const LIBELLE_ACQUIS: Record<NiveauAcquis, string> = {
  acquis: 'Acquis',
  en_cours: 'En cours d’acquisition',
  non_acquis: 'Non acquis',
};

export const estNiveauAcquis = (v: unknown): v is NiveauAcquis => typeof v === 'string' && (NIVEAUX_ACQUIS as readonly string[]).includes(v);

/** Le niveau de chaque objectif : « acquis » tant que le formateur n'a rien dit d'autre. */
export function acquisDesObjectifs(objectifs: readonly string[], saisis: unknown): Array<{ objectif: string; niveau: NiveauAcquis }> {
  const s = saisis && typeof saisis === 'object' ? (saisis as Record<string, unknown>) : {};
  return objectifs
    .map((o) => o.trim())
    .filter(Boolean)
    .map((objectif) => {
      const v = s[objectif];
      return { objectif, niveau: estNiveauAcquis(v) ? v : 'acquis' };
    });
}
