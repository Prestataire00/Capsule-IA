import { describe, expect, it } from 'vitest';
import { heuresDesSeances } from './espace-calculs';

describe('heures de l’espace entreprise, par séance', () => {
  const s = (dureeHeures: number, passee: boolean, groupe: string | null = null, formation = 'IA') => ({ dureeHeures, passee, formation, groupe });

  it('compte chaque séance une fois, réalisée sur prévue', () => {
    const r = heuresDesSeances([s(4, true), s(4, true), s(4, false), s(3.5, false)]);
    expect(r.total).toEqual({ realisees: 8, prevues: 15.5, seancesFaites: 2, seances: 4 });
  });

  it('détaille par formation et par groupe', () => {
    const r = heuresDesSeances([s(3.5, true, 'Groupe A'), s(3.5, false, 'Groupe B')]);
    expect(r.parFormation.map((f) => [f.groupe, f.realisees, f.prevues])).toEqual([
      ['Groupe A', 3.5, 3.5],
      ['Groupe B', 0, 3.5],
    ]);
  });
});
