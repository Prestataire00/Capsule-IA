import { describe, it, expect } from 'vitest';
import type { Declaration } from '../availability';
import { etatCreneau, estMobilisable, ordreAffichage, resumeSemaine, type EtatCreneau } from '../semaine';

const libre: Declaration[] = [{ creneau: 'matin', kind: 'disponible' }];
const pris: Declaration[] = [{ creneau: 'matin', kind: 'indisponible' }];
const journeePrise: Declaration[] = [{ creneau: 'journee', kind: 'indisponible' }];

describe('ce que montre une case du planning', () => {
  it('montre la séance quand il y en a une', () => {
    expect(etatCreneau(libre, 'matin', 1)).toBe('seance');
    expect(etatCreneau([], 'matin', 2)).toBe('seance');
  });

  it('CRIE quand une séance a été posée sur une indisponibilité déclarée', () => {
    expect(etatCreneau(pris, 'matin', 1)).toBe('conflit');
    // Même quand l'indisponibilité portait sur la journée entière.
    expect(etatCreneau(journeePrise, 'apres_midi', 1)).toBe('conflit');
  });

  it('rend la déclaration quand aucune séance n’est posée', () => {
    expect(etatCreneau(libre, 'matin', 0)).toBe('disponible');
    expect(etatCreneau(pris, 'matin', 0)).toBe('indisponible');
  });

  it('ne promet rien pour un créneau jamais déclaré', () => {
    expect(etatCreneau([], 'matin', 0)).toBe('non_renseigne');
    // Déclarer son matin ne dit rien de son après-midi.
    expect(etatCreneau(libre, 'apres_midi', 0)).toBe('non_renseigne');
  });

  it('n’estime mobilisable que ce qui a été déclaré libre', () => {
    const cas: Array<[EtatCreneau, boolean]> = [
      ['disponible', true],
      ['non_renseigne', false],
      ['indisponible', false],
      ['seance', false],
      ['conflit', false],
    ];
    for (const [etat, attendu] of cas) expect(estMobilisable(etat)).toBe(attendu);
  });
});

describe('résumé de la semaine d’un formateur', () => {
  it('compte le conflit comme une séance ET comme un conflit', () => {
    const r = resumeSemaine(['seance', 'conflit', 'disponible', 'non_renseigne']);
    expect(r).toEqual({ seances: 2, libres: 1, conflits: 1 });
  });

  it('ne compte pas « non renseigné » parmi les demi-journées libres', () => {
    expect(resumeSemaine(['non_renseigne', 'non_renseigne']).libres).toBe(0);
  });
});

describe('ordre des lignes', () => {
  const ligne = (nom: string, conflits: number, seances: number) => ({
    nom,
    resume: { conflits, seances, libres: 0 },
  });

  it('remonte d’abord ce qui demande une action', () => {
    const noms = ordreAffichage([
      ligne('Zoé', 0, 9),
      ligne('Adam', 0, 0),
      ligne('Marc', 1, 1),
    ]).map((l) => l.nom);
    expect(noms).toEqual(['Marc', 'Zoé', 'Adam']);
  });

  it('départage par l’alphabet à charge égale', () => {
    const noms = ordreAffichage([ligne('Émile', 0, 0), ligne('Adam', 0, 0)]).map((l) => l.nom);
    expect(noms).toEqual(['Adam', 'Émile']);
  });

  it('ne modifie pas la liste reçue', () => {
    const source = [ligne('Zoé', 0, 0), ligne('Adam', 0, 0)];
    ordreAffichage(source);
    expect(source[0]!.nom).toBe('Zoé');
  });
});
