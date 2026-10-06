import { describe, expect, it } from 'vitest';
import { memesPersonnes, participantsValides, prevenirParEmail, titreConversation } from './directs';

describe('titre d’une conversation', () => {
  it('nomme les autres personnes', () => {
    expect(titreConversation([{ nom: 'Léa' }])).toBe('Léa');
    expect(titreConversation([{ nom: 'Léa' }, { nom: 'Marc' }])).toBe('Léa et Marc');
    expect(titreConversation([{ nom: 'Léa' }, { nom: 'Marc' }, { nom: 'Inès' }])).toBe('Léa, Marc et Inès');
    expect(titreConversation([{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }, { nom: 'D' }])).toBe('A, B et 2 autres');
  });
});

describe('mêmes personnes', () => {
  it('quel que soit l’ordre, et pas un sous-ensemble', () => {
    expect(memesPersonnes(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(memesPersonnes(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });
});

describe('e-mail de prévenance', () => {
  it('au premier message, puis seulement après lecture', () => {
    expect(prevenirParEmail(null, null)).toBe(true);
    expect(prevenirParEmail('2026-10-06T10:00:00Z', null)).toBe(false);
    expect(prevenirParEmail('2026-10-06T10:00:00Z', '2026-10-06T09:00:00Z')).toBe(false);
    expect(prevenirParEmail('2026-10-06T10:00:00Z', '2026-10-06T10:05:00Z')).toBe(true);
  });
});

describe('participants', () => {
  it('écarte l’auteur et les doublons', () => {
    expect(participantsValides('moi', ['moi', 'a', 'a'], ['a', 'b'])).toEqual({ ok: true, ids: ['a'] });
  });
  it('refuse une personne hors de l’organisme', () => {
    expect(participantsValides('moi', ['x'], ['a']).ok).toBe(false);
  });
  it('refuse une conversation avec soi seul', () => {
    expect(participantsValides('moi', ['moi'], ['a']).ok).toBe(false);
  });
});
