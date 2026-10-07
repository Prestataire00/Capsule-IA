import { describe, expect, it } from 'vitest';
import { lignesParticipants, nomFichierConvocation, trierParticipants, type ParticipantConvoque } from './convocation-groupe-contenu';

const p = (prenom: string, nom: string, email: string | null = null): ParticipantConvoque => ({
  id: `${prenom}-${nom}`,
  prenom,
  nom,
  email,
  companyId: null,
});

describe('convocation de groupe', () => {
  it('trie par nom de famille, accents compris', () => {
    expect(trierParticipants([p('Léa', 'Zola'), p('Éric', 'Écart'), p('Ana', 'Durand')]).map((x) => x.nom)).toEqual([
      'Durand',
      'Écart',
      'Zola',
    ]);
  });
  it('numérote, et dit quand l’adresse manque', () => {
    expect(lignesParticipants([p('Léa', 'Zola', 'lea@client.fr'), p('Ana', 'Durand', 'x@provisoire.invalid')])).toEqual([
      '1. DURAND Ana : adresse non renseignée',
      '2. ZOLA Léa : lea@client.fr',
    ]);
  });
  it('nomme le fichier d’après le groupe et le jour', () => {
    expect(nomFichierConvocation('Groupe A (matin)', '2026-10-08T07:00:00Z', '2026-10-08')).toBe('convocation-groupe-a-matin-2026-10-08.pdf');
    expect(nomFichierConvocation(null, '2026-10-08T07:00:00Z', '')).toBe('convocation-seance-2026-10-08.pdf');
  });
});
