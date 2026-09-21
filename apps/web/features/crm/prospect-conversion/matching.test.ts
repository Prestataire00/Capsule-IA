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

// Constat du 21/09/2026 : la demande de « Nath Laurel » a ouvert un dossier au
// nom d'« Anissa Apprenant ». Les deux partageaient une adresse e-mail, et le
// rapprochement ne regardait que celle-ci — alors que le nom était disponible.
describe('matchLearner : boîte partagée', () => {
  const surLaMemeBoite = [
    { id: 'anissa', email: 'boite@exemple.fr', lastName: 'Apprenant' },
    { id: 'nath', email: 'boite@exemple.fr', lastName: 'Laurel' },
  ];

  it('ne confond plus deux personnes sur la même adresse', () => {
    expect(matchLearner('boite@exemple.fr', [surLaMemeBoite[0]!], 'Laurel')).toEqual({ action: 'create' });
  });

  it('retrouve la bonne personne quand elle existe déjà', () => {
    expect(matchLearner('boite@exemple.fr', surLaMemeBoite, 'Laurel')).toEqual({ action: 'reuse', id: 'nath' });
    expect(matchLearner('boite@exemple.fr', surLaMemeBoite, 'Apprenant')).toEqual({ action: 'reuse', id: 'anissa' });
  });

  it('ignore la casse et les espaces de saisie', () => {
    expect(matchLearner('  BOITE@exemple.FR ', surLaMemeBoite, '  laurel  ')).toEqual({ action: 'reuse', id: 'nath' });
  });

  it('sans nom fourni, s’en tient à l’adresse plutôt que de créer un doublon', () => {
    expect(matchLearner('boite@exemple.fr', surLaMemeBoite, '')).toEqual({ action: 'reuse', id: 'anissa' });
    expect(matchLearner('boite@exemple.fr', surLaMemeBoite, null)).toEqual({ action: 'reuse', id: 'anissa' });
  });

  it('rattache une fiche existante dont le nom manque', () => {
    // Un apprenant importé sans nom ne doit pas provoquer un doublon.
    expect(matchLearner('x@exemple.fr', [{ id: 'sansnom', email: 'x@exemple.fr', lastName: '' }], 'Durand')).toEqual({
      action: 'reuse',
      id: 'sansnom',
    });
  });

  it('une adresse vide ne rapproche rien', () => {
    expect(matchLearner('', surLaMemeBoite, 'Laurel')).toEqual({ action: 'create' });
  });
});
