import type { OrgStatus } from './status';

/**
 * Statut d'un indicateur au niveau de l'organisme. Partagé par la page
 * qualité et l'export d'audit, pour qu'ils ne divergent jamais.
 */

/** Ce que l'on sait de l'organisme pour décider d'une non-applicabilité. */
export type Profil = { apprentissage: boolean; certifiant: boolean; sousTraitance: boolean };

export type Applicabilite = { applies_to: string[] | null; certifying_only: boolean; condition: string | null };

export type OrgStatutRow = { indicator_id: string; status: OrgStatus; note: string | null; updated_at: string };

/**
 * Statut affiché : l'évaluation saisie par l'organisme prime. À défaut, Capsule
 * propose un statut — non applicable si l'organisme n'exerce pas l'activité
 * visée, conforme si toutes ses preuves automatiques suffisent.
 */
export function statutEffectif(
  ind: Applicabilite,
  saisi: OrgStatus | undefined,
  preuves: readonly { ok: boolean }[],
  profil: Profil,
): { status: OrgStatus; auto: boolean } {
  if (saisi) return { status: saisi, auto: false };
  const reserveApprentissage = ind.applies_to?.length === 1 && ind.applies_to[0] === 'apprentissage';
  if (
    (reserveApprentissage && !profil.apprentissage) ||
    (ind.certifying_only && !profil.certifiant) ||
    (ind.condition === 'subcontracting' && !profil.sousTraitance)
  ) {
    return { status: 'non_applicable', auto: true };
  }
  if (preuves.length > 0 && preuves.every((p) => p.ok)) return { status: 'conforme', auto: true };
  return { status: 'a_traiter', auto: true };
}

/**
 * Statuts regroupés par numéro d'indicateur, la saisie la plus récente
 * l'emportant : le travail fait sous une version vaut sous la suivante.
 */
export function statutsParNumero<T extends { indicator_id: string; updated_at: string }>(
  rows: readonly T[],
  numeroParId: ReadonlyMap<string, number>,
): Map<number, T> {
  const out = new Map<number, T>();
  for (const s of rows) {
    const n = numeroParId.get(s.indicator_id);
    if (n === undefined) continue;
    const prec = out.get(n);
    if (!prec || s.updated_at > prec.updated_at) out.set(n, s);
  }
  return out;
}

/** Preuves regroupées par numéro d'indicateur, toutes versions confondues. */
export function preuvesParNumero<T extends { indicator_id: string }>(
  rows: readonly T[],
  numeroParId: ReadonlyMap<string, number>,
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const p of rows) {
    const n = numeroParId.get(p.indicator_id);
    if (n !== undefined) out.set(n, [...(out.get(n) ?? []), p]);
  }
  return out;
}
