/**
 * Synthèse d'émargement d'une séance, pure et testable (page « Émargements »).
 *
 * Une case = un apprenant attendu × une demi-journée. Elle est « remplie » dès
 * qu'un statut est connu : présent (signature ou constat), en retard, absent
 * ou excusé. Présence = présents (retards compris) ÷ cases remplies ;
 * complétion = cases remplies ÷ cases attendues.
 */

export type LigneSignature = {
  readonly sheetId: string;
  readonly learnerId: string;
  readonly status: string;
  readonly signedAt: string | null;
  readonly selfSigned: boolean;
};

export type SyntheseSeance = {
  readonly attendues: number;
  readonly remplies: number;
  readonly presents: number;
  readonly retards: number;
  readonly absents: number;
  readonly excuses: number;
  readonly signatures: number;
  readonly tauxPresence: number | null;
  readonly completion: number | null;
};

const PRESENTS = new Set(['present', 'late', 'remote']);

export function syntheseSeance(sheetIds: readonly string[], inscrits: readonly string[], signatures: readonly LigneSignature[]): SyntheseSeance {
  const attendus = new Set(inscrits);
  const feuilles = new Set(sheetIds);
  let presents = 0;
  let retards = 0;
  let absents = 0;
  let excuses = 0;
  let signees = 0;
  const vues = new Set<string>();
  for (const s of signatures) {
    const cle = `${s.sheetId}|${s.learnerId}`;
    if (!feuilles.has(s.sheetId) || !attendus.has(s.learnerId) || vues.has(cle)) continue;
    vues.add(cle);
    if (s.selfSigned) signees++;
    if (PRESENTS.has(s.status) && s.signedAt) {
      presents++;
      if (s.status === 'late') retards++;
    } else if (s.status === 'absent') absents++;
    else if (s.status === 'absent_justified') excuses++;
  }
  const attendues = feuilles.size * attendus.size;
  const remplies = presents + absents + excuses;
  return {
    attendues,
    remplies,
    presents,
    retards,
    absents,
    excuses,
    signatures: signees,
    tauxPresence: remplies ? presents / remplies : null,
    completion: attendues ? remplies / attendues : null,
  };
}
