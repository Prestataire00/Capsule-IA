/**
 * Signatures reçues sur signatures attendues, pour une feuille ou une séance
 * (demande d'Ismael, 2026-10-08). Un apprenant doit son entrée et sa sortie,
 * le formateur son entrée ; une absence ou une excuse ne doit rien. Une
 * présence attestée par l'équipe compte comme reçue. Pur.
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
  let sA = 0;
  let manquants = 0;
  for (const p of participants) {
    if (!p.expected || p.state === 'absent' || p.state === 'excuse') continue;
    const entree = Boolean(p.entryAt || p.attestedAt);
    eA += 1;
    if (entree) eR += 1;
    let complet = entree;
    if (p.kind === 'learner') {
      const sortie = Boolean(p.exitAt || p.exitAttested);
      sA += 1;
      if (sortie) sR += 1;
      complet = complet && sortie;
    }
    if (!complet) manquants += 1;
  }
  return {
    recues: eR + sR,
    attendues: eA + sA,
    entrees: { recues: eR, attendues: eA },
    sorties: { recues: sR, attendues: sA },
    manquants,
    complet: eA + sA > 0 && eR + sR === eA + sA,
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
