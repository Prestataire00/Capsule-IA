/**
 * Signatures reçues sur signatures attendues, pour une feuille ou une séance
 * (demande d'Ismael, 2026-10-08). Chacun doit une signature par demi-journée,
 * à l'arrivée (la sortie est facultative, 2026-10-08) ; une absence ou une
 * excuse ne doit rien. Une présence attestée par l'équipe compte. Pur.
 */

export type ParticipantCompte = {
  readonly kind: 'learner' | 'trainer';
  readonly expected: boolean;
  readonly state: string;
  readonly entryAt: string | null;
  readonly attestedAt: string | null;
  readonly exitAt: string | null;
  readonly exitAttested: boolean;
};

export type Compteur = {
  readonly recues: number;
  readonly attendues: number;
  readonly entrees: { recues: number; attendues: number };
  readonly sorties: { recues: number; attendues: number };
  /** Personnes à qui il manque au moins une signature. */
  readonly manquants: number;
  readonly complet: boolean;
};

export function compteurSignatures(participants: readonly ParticipantCompte[]): Compteur {
  let eR = 0;
  let eA = 0;
  let sR = 0;
  const sA = 0;
  let manquants = 0;
  for (const p of participants) {
    if (!p.expected || p.state === 'absent' || p.state === 'excuse') continue;
    const entree = Boolean(p.entryAt || p.attestedAt);
    eA += 1;
    if (entree) eR += 1;
    // Sorties : comptées quand elles existent, jamais attendues.
    if (p.kind === 'learner' && (p.exitAt || p.exitAttested)) sR += 1;
    if (!entree) manquants += 1;
  }
  return {
    recues: eR,
    attendues: eA,
    entrees: { recues: eR, attendues: eA },
    sorties: { recues: sR, attendues: sA },
    manquants,
    complet: eA > 0 && eR === eA,
  };
}

/** Plusieurs feuilles (la séance entière) : la somme de leurs compteurs. */
export function additionner(compteurs: readonly Compteur[]): Compteur {
  const somme = (f: (c: Compteur) => number) => compteurs.reduce((t, c) => t + f(c), 0);
  const recues = somme((c) => c.recues);
  const attendues = somme((c) => c.attendues);
  return {
    recues,
    attendues,
    entrees: { recues: somme((c) => c.entrees.recues), attendues: somme((c) => c.entrees.attendues) },
    sorties: { recues: somme((c) => c.sorties.recues), attendues: somme((c) => c.sorties.attendues) },
    manquants: somme((c) => c.manquants),
    complet: attendues > 0 && recues === attendues,
  };
}
