import { describe, it, expect } from 'vitest';
import { matchLearner, matchCompany, detectPotentialDuplicates } from './matching';
import type { ProspectForConversion, LearnerCandidate, CompanyCandidate } from './types';

const prospect: ProspectForConversion = {
  id: 'p1', organizationId: null, firstName: 'Lea', lastName: 'Martin',
  email: 'Lea.Martin@Mail.com ', phone: null, birthDate: null, rqth: false,
  formationId: 'f1', preferredModality: 'distanciel', preferredStartDate: null,
  companyName: 'Acme SARL', funderKind: 'opco', convertedDossierId: null,
};

describe('matchLearner', () => {
  it('réutilise un apprenant au même email (insensible casse/espaces)', () => {
    const learners: LearnerCandidate[] = [{ id: 'l9', email: 'lea.martin@mail.com', lastName: 'Martin' }];
    expect(matchLearner(prospect.email, learners)).toEqual({ action: 'reuse', id: 'l9' });
  });
  it('crée si aucun email ne correspond', () => {
    expect(matchLearner(prospect.email, [{ id: 'l1', email: 'autre@mail.com', lastName: 'X' }]))
      .toEqual({ action: 'create' });
  });
});

describe('matchCompany', () => {
  const companies: CompanyCandidate[] = [
    { id: 'c1', name: 'Acme SARL', siret: '11111111111111' },
    { id: 'c2', name: 'Autre', siret: '22222222222222' },
  ];
  it('réutilise par SIRET prioritairement', () => {
    expect(matchCompany('22222222222222', 'Nom Different', companies)).toEqual({ action: 'reuse', id: 'c2' });
  });
  it('réutilise par nom normalisé si pas de SIRET', () => {
    expect(matchCompany(null, ' acme  sarl ', companies)).toEqual({ action: 'reuse', id: 'c1' });
  });
  it('crée si rien ne correspond', () => {
    expect(matchCompany(null, 'Inconnue', companies)).toEqual({ action: 'create' });
  });
});

describe('detectPotentialDuplicates', () => {
  it('signale un apprenant de même nom mais email différent', () => {
    const learners: LearnerCandidate[] = [{ id: 'l5', email: 'autre@mail.com', lastName: 'martin' }];
    const signals = detectPotentialDuplicates(prospect, learners, []);
    expect(signals).toContainEqual(expect.objectContaining({ kind: 'learner', existingId: 'l5' }));
  });
  it('ne signale rien quand noms et emails diffèrent', () => {
    const learners: LearnerCandidate[] = [{ id: 'l6', email: 'x@mail.com', lastName: 'Durand' }];
    expect(detectPotentialDuplicates(prospect, learners, [])).toEqual([]);
  });
});
