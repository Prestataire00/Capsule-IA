import { describe, expect, it } from 'vitest';
import {
  lignesConvocationDuGroupe,
  lignesParticipants,
  nomFichierConvocation,
  nomFichierConvocationDuGroupe,
  trierParticipants,
  type ParticipantConvoque,
} from './convocation-groupe-contenu';

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

describe('convocation d’un groupe à toutes ses dates', () => {
  const seance = (id: string, debut: string) => ({
    id,
    debut,
    fin: debut.replace('07:00', '10:30'),
    modalite: 'presentiel',
    lieu: 'Lyon',
    visio: null,
    formateur: 'Ismael',
  });
  const lea = { ...p('Léa', 'Zola', 'lea@client.fr'), id: 'l1' };
  const ana = { ...p('Ana', 'Durand'), id: 'l2' };

  it('liste chaque date dans l’ordre et les participants une seule fois', () => {
    const lignes = lignesConvocationDuGroupe({
      formation: 'Compta',
      client: 'Activ Métiers',
      groupe: 'Groupe A',
      seances: [seance('s2', '2026-10-22T07:00:00Z'), seance('s1', '2026-10-15T07:00:00Z')],
      participants: new Map([
        ['s1', [lea, ana]],
        ['s2', [lea, ana]],
      ]),
    });
    expect(lignes).toContain('Séances : 2');
    expect(lignes).toContain('### Participants convoqués (2)');
    const dates = lignes.filter((l) => l.startsWith('### ') && /\d{4}/.test(l));
    expect(dates).toEqual(['### Jeudi 15 octobre 2026', '### Jeudi 22 octobre 2026']);
    expect(lignes.filter((l) => l.startsWith('Participants :'))).toEqual([]);
  });

  it('nomme les présents d’une séance qui n’attend pas tout le groupe', () => {
    const lignes = lignesConvocationDuGroupe({
      formation: 'Compta',
      client: null,
      groupe: null,
      seances: [seance('s1', '2026-10-15T07:00:00Z'), seance('s2', '2026-10-22T07:00:00Z')],
      participants: new Map([
        ['s1', [lea, ana]],
        ['s2', [lea]],
      ]),
    });
    expect(lignes).toContain('Participants : Léa Zola');
  });

  it('nomme le fichier d’après le groupe et le client', () => {
    expect(nomFichierConvocationDuGroupe('Groupe A', 'Activ Métiers')).toBe('convocation-groupe-a-activ-metiers.pdf');
    expect(nomFichierConvocationDuGroupe(null, null)).toBe('convocation-formation.pdf');
  });
});
