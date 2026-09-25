import { describe, it, expect } from 'vitest';
import {
  classer,
  compterParGravite,
  convocationsNonOuvertes,
  devisQuiExpirent,
  financeursSansReponse,
  heuresSousLeVolume,
  joursAvant,
  qualiopiBloquant,
  arriereQualiopi,
  seancesIncompletes,
  type Signal,
} from '../signaux';

const AUJOURDHUI = '2026-09-25';

const signal = (over: Partial<Signal> = {}): Signal => ({
  code: 'x',
  titre: 'x',
  detail: 'x',
  gravite: 'urgent',
  echeance: null,
  montantCents: null,
  href: '/',
  ...over,
});

describe('écart en jours', () => {
  it('compte à venir et passé', () => {
    expect(joursAvant('2026-09-28', AUJOURDHUI)).toBe(3);
    expect(joursAvant('2026-09-20', AUJOURDHUI)).toBe(-5);
    expect(joursAvant('2026-09-25', AUJOURDHUI)).toBe(0);
  });

  it('ignore l’heure', () => {
    expect(joursAvant('2026-09-28T23:59:00Z', '2026-09-25T00:01:00Z')).toBe(3);
  });
});

describe('classement', () => {
  it('met ce qui bloque avant ce qui est seulement urgent', () => {
    const r = classer(
      [signal({ code: 'b', gravite: 'a_surveiller' }), signal({ code: 'a', gravite: 'bloquant' })],
      AUJOURDHUI,
    );
    expect(r.map((s) => s.code)).toEqual(['a', 'b']);
  });

  it('à gravité égale, l’échéance la plus proche passe devant', () => {
    const r = classer(
      [
        signal({ code: 'loin', echeance: '2026-10-30' }),
        signal({ code: 'demain', echeance: '2026-09-26' }),
      ],
      AUJOURDHUI,
    );
    expect(r.map((s) => s.code)).toEqual(['demain', 'loin']);
  });

  it('un gros montant ne double pas une petite urgence', () => {
    // Trier par argent d'abord ferait manquer les petites urgences, qui sont
    // les plus nombreuses.
    const r = classer(
      [
        signal({ code: 'gros', echeance: '2026-10-30', montantCents: 900000 }),
        signal({ code: 'petit', echeance: '2026-09-26', montantCents: 15000 }),
      ],
      AUJOURDHUI,
    );
    expect(r[0]!.code).toBe('petit');
  });

  it('départage par le montant à échéance égale', () => {
    const r = classer(
      [
        signal({ code: 'modeste', echeance: '2026-09-26', montantCents: 10000 }),
        signal({ code: 'lourd', echeance: '2026-09-26', montantCents: 500000 }),
      ],
      AUJOURDHUI,
    );
    expect(r[0]!.code).toBe('lourd');
  });

  it('fait passer devant ce qui n’a pas d’échéance : c’est déjà en retard', () => {
    const r = classer(
      [signal({ code: 'date', echeance: '2026-09-26' }), signal({ code: 'sans', echeance: null })],
      AUJOURDHUI,
    );
    expect(r[0]!.code).toBe('sans');
  });

  it('ne modifie pas la liste reçue', () => {
    const source = [signal({ code: 'b', gravite: 'a_surveiller' }), signal({ code: 'a', gravite: 'bloquant' })];
    classer(source, AUJOURDHUI);
    expect(source[0]!.code).toBe('b');
  });

  it('compte par gravité', () => {
    expect(compterParGravite([signal({ gravite: 'bloquant' }), signal({ gravite: 'urgent' })])).toEqual({
      bloquant: 1,
      urgent: 1,
      a_surveiller: 0,
    });
  });
});

describe('financeur sans réponse', () => {
  const ligne = {
    dossierId: 'd1',
    reference: 'DOS-1',
    financeur: 'OPCO EP',
    statut: 'submitted',
    deposeLe: '2026-08-20',
    montantCents: 120000,
  };

  it('signale au-delà du seuil, en disant depuis quand', () => {
    const [s] = financeursSansReponse([ligne], AUJOURDHUI);
    expect(s!.detail).toMatch(/36 jours/);
    expect(s!.montantCents).toBe(120000);
  });

  it('se tait en deçà du seuil', () => {
    expect(financeursSansReponse([{ ...ligne, deposeLe: '2026-09-20' }], AUJOURDHUI)).toHaveLength(0);
  });

  it('ignore ce qui n’est pas en attente', () => {
    for (const statut of ['approved', 'refused', 'paid', 'pending']) {
      expect(financeursSansReponse([{ ...ligne, statut }], AUJOURDHUI), statut).toHaveLength(0);
    }
  });

  it('ignore une demande sans date de dépôt : on ne devine pas l’ancienneté', () => {
    expect(financeursSansReponse([{ ...ligne, deposeLe: null }], AUJOURDHUI)).toHaveLength(0);
  });
});

describe('heures sous le volume financé', () => {
  const ligne = {
    dossierId: 'd1',
    reference: 'DOS-1',
    heuresFinancees: 21,
    heuresProjetees: 14,
    aRisque: true,
    finLe: '2026-10-10',
  };

  it('chiffre le manque et le temps restant', () => {
    const [s] = heuresSousLeVolume([ligne], AUJOURDHUI);
    expect(s!.detail).toMatch(/7 h manquantes sur 21 h/);
    expect(s!.gravite).toBe('urgent');
  });

  it('devient bloquant une fois la formation finie : plus rien à rattraper', () => {
    const [s] = heuresSousLeVolume([{ ...ligne, finLe: '2026-09-10' }], AUJOURDHUI);
    expect(s!.gravite).toBe('bloquant');
  });

  it('se tait quand la base ne signale aucun risque', () => {
    expect(heuresSousLeVolume([{ ...ligne, aRisque: false }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait quand le projeté atteint le financé', () => {
    expect(heuresSousLeVolume([{ ...ligne, heuresProjetees: 21 }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait sur un dossier à 1 h : c’est le minimum de la base, pas un volume', () => {
    // Constaté sur les données réelles : « 1 h manquantes sur 1 h financées ».
    const placeholder = { ...ligne, heuresFinancees: 1, heuresProjetees: 0 };
    expect(heuresSousLeVolume([placeholder], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait sous la demi-heure d’écart : c’est de l’arrondi', () => {
    expect(
      heuresSousLeVolume([{ ...ligne, heuresFinancees: 21, heuresProjetees: 20.75 }], AUJOURDHUI),
    ).toHaveLength(0);
  });
});

describe('convocation non ouverte', () => {
  const ligne = {
    dossierId: 'd1',
    sessionId: 's1',
    intitule: 'Initiation',
    destinataire: 'marie@acme.fr',
    envoyeeLe: '2026-09-18',
    ouverte: false,
    seanceLe: '2026-09-27',
  };

  it('alerte quand la séance approche', () => {
    const [s] = convocationsNonOuvertes([ligne], AUJOURDHUI);
    expect(s!.detail).toMatch(/Séance dans 2 jour/);
  });

  it('monte en urgence la veille et le jour même', () => {
    expect(convocationsNonOuvertes([{ ...ligne, seanceLe: '2026-09-26' }], AUJOURDHUI)[0]!.gravite).toBe('urgent');
    expect(convocationsNonOuvertes([{ ...ligne, seanceLe: AUJOURDHUI }], AUJOURDHUI)[0]!.detail).toMatch(
      /aujourd’hui/,
    );
  });

  it('se tait pour une convocation ouverte', () => {
    expect(convocationsNonOuvertes([{ ...ligne, ouverte: true }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait pour une séance déjà passée : l’alerte ne sert plus à rien', () => {
    expect(convocationsNonOuvertes([{ ...ligne, seanceLe: '2026-09-20' }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait pour une séance encore lointaine', () => {
    expect(convocationsNonOuvertes([{ ...ligne, seanceLe: '2026-10-20' }], AUJOURDHUI)).toHaveLength(0);
  });
});

describe('devis qui expirent', () => {
  const ligne = {
    devisId: 'q1',
    reference: 'DEV-2026-001',
    client: 'ACME',
    statut: 'sent',
    valideJusquau: '2026-09-28',
    totalCents: 240000,
  };

  it('alerte avant l’expiration', () => {
    const [s] = devisQuiExpirent([ligne], AUJOURDHUI);
    expect(s!.detail).toMatch(/dans 3 jour/);
    expect(s!.gravite).toBe('urgent');
  });

  it('devient bloquant une fois expiré, en disant depuis quand', () => {
    const [s] = devisQuiExpirent([{ ...ligne, valideJusquau: '2026-09-20' }], AUJOURDHUI);
    expect(s!.gravite).toBe('bloquant');
    expect(s!.detail).toMatch(/expiré il y a 5 jour/);
  });

  it('ignore un devis signé, refusé ou en brouillon', () => {
    for (const statut of ['signed', 'refused', 'draft', 'expired', 'cancelled']) {
      expect(devisQuiExpirent([{ ...ligne, statut }], AUJOURDHUI), statut).toHaveLength(0);
    }
  });
});

describe('séance incomplète', () => {
  const ligne = {
    sessionId: 's1',
    intitule: 'Groupe A',
    debutLe: '2026-09-29',
    aUnFormateur: false,
    aDesParticipants: true,
  };

  it('nomme précisément ce qui manque', () => {
    const [s] = seancesIncompletes([ligne], AUJOURDHUI);
    expect(s!.detail).toMatch(/aucun formateur désigné/);
  });

  it('cumule les manques', () => {
    const [s] = seancesIncompletes([{ ...ligne, aDesParticipants: false }], AUJOURDHUI);
    expect(s!.detail).toMatch(/formateur/);
    expect(s!.detail).toMatch(/participant/);
  });

  it('bloque quand la séance est dans trois jours ou moins', () => {
    expect(seancesIncompletes([{ ...ligne, debutLe: '2026-09-27' }], AUJOURDHUI)[0]!.gravite).toBe('bloquant');
  });

  it('se tait pour une séance complète', () => {
    expect(seancesIncompletes([{ ...ligne, aUnFormateur: true }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait pour une séance passée', () => {
    expect(seancesIncompletes([{ ...ligne, debutLe: '2026-09-01' }], AUJOURDHUI)).toHaveLength(0);
  });
});

describe('Qualiopi bloquant', () => {
  const ligne = { dossierId: 'd1', reference: 'DOS-1', bloquantsManquants: 2, debutLe: '2026-10-02' };

  it('alerte avant le démarrage', () => {
    const [s] = qualiopiBloquant([ligne], AUJOURDHUI);
    expect(s!.titre).toMatch(/2 indicateur/);
    expect(s!.gravite).toBe('bloquant');
  });

  it('dit que la preuve devra être reconstituée quand la formation a commencé', () => {
    const [s] = qualiopiBloquant([{ ...ligne, debutLe: '2026-09-15' }], AUJOURDHUI);
    expect(s!.detail).toMatch(/reconstituée/);
  });

  it('ne hurle plus une fois la formation commencée : elle ne se rattrape plus', () => {
    expect(qualiopiBloquant([{ ...ligne, debutLe: '2026-09-15' }], AUJOURDHUI)[0]!.gravite).toBe(
      'a_surveiller',
    );
  });

  it('abandonne l’arriéré ancien plutôt que de le ressasser chaque jour', () => {
    // Sur les données réelles, une formation de mars remontait tous les matins
    // depuis 186 jours et noyait les vraies urgences.
    expect(qualiopiBloquant([{ ...ligne, debutLe: '2026-03-22' }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait quand rien ne bloque', () => {
    expect(qualiopiBloquant([{ ...ligne, bloquantsManquants: 0 }], AUJOURDHUI)).toHaveLength(0);
  });

  it('se tait pour un démarrage encore lointain', () => {
    expect(qualiopiBloquant([{ ...ligne, debutLe: '2026-12-01' }], AUJOURDHUI)).toHaveLength(0);
  });

  it('ignore un dossier sans date de début : on ne devine pas l’urgence', () => {
    expect(qualiopiBloquant([{ ...ligne, debutLe: null }], AUJOURDHUI)).toHaveLength(0);
  });
});

describe('arriéré Qualiopi', () => {
  it('compte ce que la liste du jour laisse de côté', () => {
    const vieux = [
      { dossierId: 'd1', reference: 'A', bloquantsManquants: 4, debutLe: '2026-03-22' },
      { dossierId: 'd2', reference: 'B', bloquantsManquants: 2, debutLe: '2026-06-29' },
      { dossierId: 'd3', reference: 'C', bloquantsManquants: 5, debutLe: '2026-09-20' },
    ];
    expect(arriereQualiopi(vieux, AUJOURDHUI)).toEqual({ dossiers: 2, indicateurs: 6 });
  });

  it('ne compte pas les dossiers conformes', () => {
    const r = arriereQualiopi(
      [{ dossierId: 'd1', reference: 'A', bloquantsManquants: 0, debutLe: '2026-03-22' }],
      AUJOURDHUI,
    );
    expect(r).toEqual({ dossiers: 0, indicateurs: 0 });
  });
});
