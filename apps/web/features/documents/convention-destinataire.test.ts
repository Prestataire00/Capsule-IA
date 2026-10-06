import { describe, expect, it } from 'vitest';
import { conventionAuReferent, conventionVisiblePourLeStagiaire } from './convention-destinataire';

describe('destinataire de la convention', () => {
  it('dossier d’entreprise : au référent, jamais au stagiaire', () => {
    expect(conventionAuReferent({ companyId: 'c1' })).toBe(true);
    expect(conventionVisiblePourLeStagiaire({ companyId: 'c1' })).toBe(false);
  });
  it('particulier : son propre contrat, il le reçoit', () => {
    expect(conventionAuReferent({ companyId: null })).toBe(false);
    expect(conventionVisiblePourLeStagiaire({ companyId: null })).toBe(true);
  });
});

import { documentVisiblePourLeStagiaire } from './convention-destinataire';

describe('documents visibles par le stagiaire', () => {
  it('jamais un document interne', () => {
    expect(documentVisiblePourLeStagiaire({ visibleEntreprise: false, kind: 'programme' }, { companyId: null })).toBe(false);
  });
  it('un document commun à tous', () => {
    expect(documentVisiblePourLeStagiaire({ visibleEntreprise: true, kind: 'programme' }, { companyId: 'c1' })).toBe(true);
  });
  it('jamais la convention d’une entreprise, même commune à tous', () => {
    expect(documentVisiblePourLeStagiaire({ visibleEntreprise: true, kind: 'convention' }, { companyId: 'c1' })).toBe(false);
  });
  it('le contrat d’un particulier quand il est commun', () => {
    expect(documentVisiblePourLeStagiaire({ visibleEntreprise: true, kind: 'convention' }, { companyId: null })).toBe(true);
  });
});
