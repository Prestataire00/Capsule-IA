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

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * Le niveau de chaque objectif : celui de l'apprenant (0236), sinon celui du
 * dossier (0234), sinon « acquis » — le formateur ne corrige que l'exception.
 */
export function acquisDesObjectifs(
  objectifs: readonly string[],
  saisisDossier: unknown,
  saisisApprenant?: unknown,
): Array<{ objectif: string; niveau: NiveauAcquis }> {
  const dossier = objet(saisisDossier);
  const apprenant = objet(saisisApprenant);
  return objectifs
    .map((o) => o.trim())
    .filter(Boolean)
    .map((objectif) => {
      const a = apprenant[objectif];
      const d = dossier[objectif];
      return { objectif, niveau: estNiveauAcquis(a) ? a : estNiveauAcquis(d) ? d : 'acquis' };
    });
}

/** Les acquis d'un apprenant dans `acquis_par_apprenant`. */
export const acquisDeLApprenant = (parApprenant: unknown, learnerId: string | null | undefined): unknown =>
  learnerId ? objet(parApprenant)[learnerId] : undefined;
