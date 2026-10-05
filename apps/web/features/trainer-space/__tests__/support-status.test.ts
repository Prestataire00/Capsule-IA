import { describe, it, expect } from 'vitest';
import {
  peutValiderSupports,
  estVisibleParApprenant,
  peutResoumettre,
  isSupportStatus,
  destinatairesValidation,
} from '../support-status';

describe('validation des supports de cours', () => {
  it('réserve la validation à la direction', () => {
    expect(peutValiderSupports('owner')).toBe(true);
    expect(peutValiderSupports('admin')).toBe(true);
  });

  it('refuse la validation à tous les autres rôles, formateur compris', () => {
    for (const role of ['gestionnaire', 'formateur', 'comptable', 'commercial', 'referent', '', null, undefined]) {
      expect(peutValiderSupports(role)).toBe(false);
    }
  });

  it('ne diffuse un support qu’une fois validé', () => {
    expect(estVisibleParApprenant({ validationStatus: 'en_attente', isPublished: true })).toBe(false);
    expect(estVisibleParApprenant({ validationStatus: 'refuse', isPublished: true })).toBe(false);
    expect(estVisibleParApprenant({ validationStatus: 'valide', isPublished: true })).toBe(true);
  });

  it('laisse le formateur retirer un support pourtant validé', () => {
    expect(estVisibleParApprenant({ validationStatus: 'valide', isPublished: false })).toBe(false);
  });

  it('n’autorise une nouvelle soumission qu’après un refus', () => {
    expect(peutResoumettre('refuse')).toBe(true);
    expect(peutResoumettre('en_attente')).toBe(false);
    expect(peutResoumettre('valide')).toBe(false);
  });

  it('rejette un statut inconnu venu de la base', () => {
    expect(isSupportStatus('valide')).toBe(true);
    expect(isSupportStatus('publie')).toBe(false);
    expect(isSupportStatus(null)).toBe(false);
  });
});

describe('validation désignée (0203)', () => {
  it('un validateur désigné décide, quel que soit son rôle', () => {
    expect(peutValiderSupports('gestionnaire', true)).toBe(true);
    expect(peutValiderSupports('gestionnaire')).toBe(false);
  });

  it('sans validateur désigné, la direction relit', () => {
    expect(destinatairesValidation([], ['owner-1', 'admin-1'])).toEqual({
      validateurs: ['owner-1', 'admin-1'],
      copie: [],
    });
  });

  it('les validateurs désignés remplacent la direction, la copie suit', () => {
    expect(
      destinatairesValidation(
        [
          { userId: 'faouzi', role: 'validateur' },
          { userId: 'isma', role: 'validateur' },
          { userId: 'laurie', role: 'copie' },
        ],
        ['owner-1'],
      ),
    ).toEqual({ validateurs: ['faouzi', 'isma'], copie: ['laurie'] });
  });

  it('la copie seule laisse la direction valider', () => {
    expect(destinatairesValidation([{ userId: 'laurie', role: 'copie' }], ['owner-1'])).toEqual({
      validateurs: ['owner-1'],
      copie: ['laurie'],
    });
  });

  it('personne ne reçoit deux fois le même e-mail', () => {
    expect(destinatairesValidation([{ userId: 'owner-1', role: 'copie' }], ['owner-1'])).toEqual({
      validateurs: ['owner-1'],
      copie: [],
    });
  });
});
