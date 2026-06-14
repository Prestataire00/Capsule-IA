import { describe, it, expect } from 'vitest';
import { buildLegalPrompt } from '../build-legal-prompt';

describe('buildLegalPrompt', () => {
  const sources = [{ ref: 'R6352-1', texte: 'Le règlement intérieur est établi…' }];
  const org = { name: 'Acme OF', nda: '11 75 12345 75' };

  it('inclut les extraits légaux fournis et l’organisme', () => {
    const p = buildLegalPrompt('reglement_interieur', org, sources);
    expect(p).toContain('R6352-1');
    expect(p).toContain('Le règlement intérieur est établi');
    expect(p).toContain('Acme OF');
    expect(p).toContain('11 75 12345 75');
  });

  it('interdit explicitement d’inventer des sources', () => {
    const p = buildLegalPrompt('cgv', org, sources);
    expect(p).toContain('UNIQUEMENT');
    expect(p).toContain("N'invente AUCUN article");
    expect(p.toLowerCase()).toContain('conditions générales de vente');
  });

  it('omet les champs org absents proprement', () => {
    const p = buildLegalPrompt('livret_accueil', { name: 'X' }, sources);
    expect(p).toContain("livret d'accueil");
    expect(p).not.toContain('Adresse :');
    expect(p).not.toContain('Représentant :');
  });
});
