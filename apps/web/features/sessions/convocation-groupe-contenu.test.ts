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
  it('numérote, dit qui l’entreprise doit prévenir, sans publier d’adresse', () => {
    const lignes = lignesParticipants([p('Léa', 'Zola', 'lea@client.fr'), p('Ana', 'Durand', 'x@provisoire.invalid')]);
    expect(lignes).toEqual(['1. DURAND Ana : à prévenir par l’entreprise', '2. ZOLA Léa : convoqué(e) par e-mail']);
    expect(lignes.join(' ')).not.toContain('@');
  });
  it('nomme le fichier d’après le groupe et le jour', () => {
    expect(nomFichierConvocation('Groupe A (matin)', '2026-10-08T07:00:00Z', '2026-10-08')).toBe('convocation-groupe-a-matin-2026-10-08.pdf');
    expect(nomFichierConvocation(null, '2026-10-08T07:00:00Z', '')).toBe('convocation-seance-2026-10-08.pdf');
  });
});
